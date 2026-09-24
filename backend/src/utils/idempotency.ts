import { createHash } from "node:crypto";

export function createRequestFingerprint(input: unknown): string {
  const normalized = JSON.stringify(input);

  return createHash("sha256")
    .update(normalized)
    .digest("hex");
}