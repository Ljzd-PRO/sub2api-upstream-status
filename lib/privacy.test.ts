import { describe, expect, it } from "vitest";

import { maskAccountName } from "@/lib/privacy";

describe("maskAccountName", () => {
  it("masks email-style account names while preserving recognisable shape", () => {
    expect(maskAccountName("mcdhacg@foxmail.com")).toBe("mc****g@fo****l.com");
  });

  it("masks non-email account names", () => {
    expect(maskAccountName("VisionCoder")).toBe("Vi*******er");
  });

  it("handles short values", () => {
    expect(maskAccountName("ab")).toBe("a*");
    expect(maskAccountName("x")).toBe("*");
  });
});
