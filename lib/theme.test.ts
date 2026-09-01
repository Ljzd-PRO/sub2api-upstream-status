import { describe, expect, it } from "vitest";

import { isThemeChoice, resolveThemeChoice } from "@/lib/theme";

describe("isThemeChoice", () => {
  it("accepts only supported theme choices", () => {
    expect(isThemeChoice("auto")).toBe(true);
    expect(isThemeChoice("light")).toBe(true);
    expect(isThemeChoice("dark")).toBe(true);
    expect(isThemeChoice("system")).toBe(false);
    expect(isThemeChoice(null)).toBe(false);
  });
});

describe("resolveThemeChoice", () => {
  it("follows the system preference in auto mode", () => {
    expect(resolveThemeChoice("auto", false)).toBe("light");
    expect(resolveThemeChoice("auto", true)).toBe("dark");
  });

  it("keeps an explicit manual choice", () => {
    expect(resolveThemeChoice("light", true)).toBe("light");
    expect(resolveThemeChoice("dark", false)).toBe("dark");
  });
});
