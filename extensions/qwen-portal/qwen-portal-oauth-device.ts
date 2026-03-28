import { randomUUID } from "node:crypto";
import { ensureGlobalUndiciEnvProxyDispatcher } from "openclaw/plugin-sdk/infra-runtime";
import type { ProviderAuthContext } from "openclaw/plugin-sdk/provider-auth";
import {
  buildOauthProviderAuthResult,
  generatePkceVerifierChallenge,
  toFormUrlEncoded,
  type OAuthCredential,
  type ProviderAuthResult,
} from "openclaw/plugin-sdk/provider-auth";
import { QWEN_PORTAL_DEFAULT_MODEL_REF, buildQwenPortalProvider } from "./provider-catalog.js";

const QWEN_OAUTH_BASE_URL = "https://chat.qwen.ai";
const QWEN_OAUTH_DEVICE_CODE_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/device/code`;
const QWEN_OAUTH_TOKEN_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`;
const QWEN_OAUTH_CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56";
const QWEN_OAUTH_SCOPE = "openid profile email model.completion";
const QWEN_DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
  error?: string;
};

type TokenResponse = {
  access_token?: string | null;
  refresh_token?: string | null;
  expires_in?: number | null;
};

type PollResult =
  | { status: "success"; access: string; refresh: string; expiresMs: number }
  | { status: "pending"; slowDown?: boolean }
  | { status: "error"; message: string };

async function requestDeviceCode(challenge: string): Promise<DeviceCodeResponse> {
  const res = await fetch(QWEN_OAUTH_DEVICE_CODE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "x-request-id": randomUUID(),
    },
    body: toFormUrlEncoded({
      client_id: QWEN_OAUTH_CLIENT_ID,
      scope: QWEN_OAUTH_SCOPE,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Device code request failed (${res.status}): ${errorText}`);
  }
  const payload = (await res.json()) as DeviceCodeResponse;
  if (!payload.device_code || !payload.user_code || !payload.verification_uri) {
    throw new Error(payload.error ?? "Incomplete device code response");
  }
  return payload;
}

async function pollDeviceToken(deviceCode: string, verifier: string): Promise<PollResult> {
  const res = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: toFormUrlEncoded({
      grant_type: QWEN_DEVICE_GRANT,
      client_id: QWEN_OAUTH_CLIENT_ID,
      device_code: deviceCode,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      error_description?: string;
    };
    if (body.error === "authorization_pending") {
      return { status: "pending" };
    }
    if (body.error === "slow_down") {
      return { status: "pending", slowDown: true };
    }
    return {
      status: "error",
      message: body.error_description ?? body.error ?? res.statusText,
    };
  }
  const t = (await res.json()) as TokenResponse;
  if (!t.access_token || !t.refresh_token || t.expires_in == null) {
    return { status: "error", message: "Incomplete token response" };
  }
  return {
    status: "success",
    access: t.access_token,
    refresh: t.refresh_token,
    expiresMs: Date.now() + t.expires_in * 1000,
  };
}

export async function refreshQwenPortalOAuthCredential(
  cred: OAuthCredential,
): Promise<OAuthCredential> {
  if (!cred.refresh?.trim()) {
    throw new Error("Qwen Portal OAuth refresh token missing.");
  }
  const res = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: cred.refresh.trim(),
      client_id: QWEN_OAUTH_CLIENT_ID,
    }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Qwen Portal token refresh failed (${res.status}): ${errorText}`);
  }
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token || !data.refresh_token || data.expires_in == null) {
    throw new Error("Invalid Qwen Portal refresh response");
  }
  return {
    ...cred,
    type: "oauth",
    provider: cred.provider,
    access: data.access_token,
    refresh: data.refresh_token,
    expires: Date.now() + data.expires_in * 1000,
  };
}

export async function runQwenPortalDeviceOAuth(
  ctx: ProviderAuthContext,
): Promise<ProviderAuthResult> {
  ensureGlobalUndiciEnvProxyDispatcher();

  const { verifier, challenge } = generatePkceVerifierChallenge();
  let device: DeviceCodeResponse;
  try {
    device = await requestDeviceCode(challenge);
  } catch (err) {
    ctx.runtime.error(err instanceof Error ? err.message : String(err));
    return { profiles: [] };
  }

  const verificationUrl = device.verification_uri_complete ?? device.verification_uri;
  await ctx.prompter.note(
    ctx.isRemote
      ? [
          "Open this URL on a machine with a browser:",
          verificationUrl,
          "",
          `User code: ${device.user_code}`,
          "",
          "Approve access, then return here.",
        ].join("\n")
      : [
          "Complete Qwen sign-in in your browser.",
          "",
          `If it does not open automatically: ${verificationUrl}`,
          "",
          `User code: ${device.user_code}`,
        ].join("\n"),
    "Qwen Portal OAuth",
  );

  try {
    await ctx.openUrl(verificationUrl);
  } catch {
    // ignore
  }

  const spin = ctx.prompter.progress("Waiting for Qwen authorization…");
  const start = Date.now();
  let intervalMs = (device.interval ?? 2) * 1000;
  const timeoutMs = device.expires_in * 1000;

  try {
    while (Date.now() - start < timeoutMs) {
      const result = await pollDeviceToken(device.device_code, verifier);
      if (result.status === "success") {
        spin.stop("Qwen Portal OAuth complete");
        return buildOauthProviderAuthResult({
          providerId: "qwen-portal",
          defaultModel: QWEN_PORTAL_DEFAULT_MODEL_REF,
          access: result.access,
          refresh: result.refresh,
          expires: result.expiresMs,
          notes: [
            `Default API: ${buildQwenPortalProvider().baseUrl}`,
            "Upstream may change or revoke this flow without notice; prefer Model Studio for production.",
          ],
        });
      }
      if (result.status === "error") {
        spin.stop("Qwen Portal OAuth failed");
        ctx.runtime.error(result.message);
        return { profiles: [] };
      }
      if (result.status === "pending" && result.slowDown) {
        intervalMs = Math.min(intervalMs * 1.5, 10_000);
      }
      spin.update("Waiting for Qwen authorization…");
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    spin.stop("Qwen Portal OAuth timed out");
    ctx.runtime.error("Authorization timed out. Try again.");
    return { profiles: [] };
  } catch (err) {
    spin.stop("Qwen Portal OAuth failed");
    ctx.runtime.error(err instanceof Error ? err.message : String(err));
    return { profiles: [] };
  }
}
