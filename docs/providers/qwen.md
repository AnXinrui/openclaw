---
summary: "Use Qwen models via Alibaba Cloud Model Studio"
read_when:
  - You want to use Qwen with OpenClaw
  - You previously used Qwen OAuth
title: "Qwen"
---

# Qwen

<Warning>

**Two paths:** [Model Studio](/providers/modelstudio) is the supported
Alibaba Cloud route (API key). **Qwen Portal OAuth** (`qwen-portal`) is an
optional bundled integration (device sign-in at `chat.qwen.ai`, inference at
`portal.qwen.ai`) that may change or stop working without notice. See
[Issue #49557](https://github.com/openclaw/openclaw/issues/49557) for history.

</Warning>

## Optional: Qwen Portal OAuth

```bash
openclaw onboard --auth-choice qwen-portal-oauth
# or
openclaw models auth login --provider qwen-portal
```

Default model: `qwen-portal/coder-model`.

## Recommended: Model Studio (Alibaba Cloud Coding Plan)

Use [Model Studio](/providers/modelstudio) for officially supported access to
Qwen models (Qwen 3.5 Plus, GLM-4.7, Kimi K2.5, MiniMax M2.5, and more).

```bash
# Global endpoint
openclaw onboard --auth-choice modelstudio-api-key

# China endpoint
openclaw onboard --auth-choice modelstudio-api-key-cn
```

See [Model Studio](/providers/modelstudio) for full setup details.
