import type { ExecutionSnapshot } from "@/lib/validation/crawler";

const REPRODUCIBILITY_FIELDS = [
  "agentVersion",
  "platform",
  "pythonVersion",
  "gitVersion",
  "dependencyFingerprint",
  "commandHash",
] as const satisfies ReadonlyArray<keyof ExecutionSnapshot>;

export type ExecutionDrift = {
  field: (typeof REPRODUCIBILITY_FIELDS)[number];
  expected: string;
  actual: string;
};

export function findExecutionDrift(
  expected: ExecutionSnapshot,
  actual: ExecutionSnapshot,
): ExecutionDrift[] {
  return REPRODUCIBILITY_FIELDS.flatMap((field) =>
    expected[field] === actual[field]
      ? []
      : [{ field, expected: expected[field], actual: actual[field] }],
  );
}
