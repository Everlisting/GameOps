import { describe, expect, it } from "vitest";

import { findExecutionDrift } from "@/lib/crawler/reproducibility";
import { taskPrepareSchema } from "@/lib/validation/crawler";

const validPayload = {
  sourceRevision: "f8ac17db2bdcb384dd3892a1de07558d21da016a",
  executionSnapshot: {
    schemaVersion: 1 as const,
    capturedAt: "2026-07-30T07:30:00.000Z",
    agentVersion: "0.5.0",
    hostname: "CRAWLER-01",
    platform: "Windows-10",
    pythonVersion: "3.12.8",
    pythonExecutable: "D:\\crawler\\.venv\\Scripts\\python.exe",
    gitVersion: "git version 2.50.1.windows.1",
    dependencyFingerprint:
      "a".repeat(64),
    dependencies: ["requests==2.34.2"],
    commandHash: "b".repeat(64),
  },
};

describe("taskPrepareSchema", () => {
  it("accepts a reproducible execution snapshot", () => {
    expect(taskPrepareSchema.parse(validPayload)).toEqual(validPayload);
  });

  it("rejects a revision that could be interpreted as command syntax", () => {
    expect(() =>
      taskPrepareSchema.parse({
        ...validPayload,
        sourceRevision: "main^{commit}",
      }),
    ).toThrow();
  });

  it("rejects non-sha256 fingerprints", () => {
    expect(() =>
      taskPrepareSchema.parse({
        ...validPayload,
        executionSnapshot: {
          ...validPayload.executionSnapshot,
          commandHash: "short",
        },
      }),
    ).toThrow();
  });

  it("detects environment drift but ignores host/path-only changes", () => {
    const expected = taskPrepareSchema.parse(validPayload).executionSnapshot;
    const actual = {
      ...expected,
      hostname: "CRAWLER-RENAMED",
      pythonExecutable: "E:\\agent\\.venv\\Scripts\\python.exe",
      pythonVersion: "3.13.0",
      dependencyFingerprint: "c".repeat(64),
    };

    expect(findExecutionDrift(expected, actual)).toEqual([
      {
        field: "pythonVersion",
        expected: "3.12.8",
        actual: "3.13.0",
      },
      {
        field: "dependencyFingerprint",
        expected: "a".repeat(64),
        actual: "c".repeat(64),
      },
    ]);
  });
});
