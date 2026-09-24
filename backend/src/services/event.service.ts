import { randomUUID } from "node:crypto";
import { MongoServerError } from "mongodb";

import { operationalEvents } from "../lib/mongo.js";

export type OperationalEvent = {
  eventId: string;
  eventType:
    | "attempt.succeeded"
    | "attempt.rejected";
  tenantId: string;
  studentId: string;
  attemptId?: string;
  requestId: string;
  occurredAt: Date;
  metadata: Record<string, unknown>;
};

export async function appendOperationalEvent(
  event: OperationalEvent,
): Promise<void> {
  try {
    await operationalEvents.insertOne(event);
  } catch (error) {
    if (
      error instanceof MongoServerError &&
      error.code === 11000
    ) {
      // Event already exists.
      // Safe to treat a retry as successful.
      return;
    }

    throw error;
  }
}

export function createRequestId(): string {
  return randomUUID();
}

export function createEventId(): string {
  return randomUUID();
}