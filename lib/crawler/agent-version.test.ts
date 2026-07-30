import { describe, expect, it } from "vitest";

import { supportsReproducibleExecution } from "@/lib/crawler/agent-version";

describe("supportsReproducibleExecution", () => {
  it.each([
    ["0.5.0", true],
    ["0.5.1", true],
    ["1.0.0", true],
    ["0.5.0-rc.1", true],
    ["0.4.9", false],
    [null, false],
    ["unknown", false],
  ])("checks %s", (version, expected) => {
    expect(supportsReproducibleExecution(version)).toBe(expected);
  });
});
