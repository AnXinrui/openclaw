import { describe, expect, it } from "vitest";
import { formatAuthDoctorHint } from "./auth-profiles/doctor.js";
import type { AuthProfileStore } from "./auth-profiles/types.js";

const EMPTY_STORE: AuthProfileStore = {
  version: 1,
  profiles: {},
};

describe("formatAuthDoctorHint", () => {
  it("does not treat qwen-portal as a removed integration", async () => {
    const hint = await formatAuthDoctorHint({
      store: EMPTY_STORE,
      provider: "qwen-portal",
    });

    expect(hint).not.toContain("deprecated");
    expect(hint).not.toContain("migrate to Model Studio");
  });
});
