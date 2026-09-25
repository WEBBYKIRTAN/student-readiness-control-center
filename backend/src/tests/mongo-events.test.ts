import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { MongoServerError } from "mongodb";

const { mockInsertOne } = vi.hoisted(() => ({
  mockInsertOne: vi.fn(),
}));

vi.mock("../lib/mongo.js", () => ({
  operationalEvents: {
    insertOne: mockInsertOne,
  },
}));

import {
  appendOperationalEvent,
} from "../services/event.service.js";

describe("MongoDB operational events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("appends an operational event", async () => {
    mockInsertOne.mockResolvedValue({
      acknowledged: true,
    });

    const event = {
      eventId: "event-001",
      eventType: "attempt.succeeded" as const,
      tenantId: "tenant-001",
      studentId: "student-001",
      attemptId: "attempt-001",
      requestId: "request-001",
      occurredAt: new Date(),
      metadata: {
        score: 85,
      },
    };

    await appendOperationalEvent(event);

    expect(mockInsertOne).toHaveBeenCalledTimes(1);
    expect(mockInsertOne).toHaveBeenCalledWith(event);
  });

  it("does not fail when the same eventId already exists", async () => {
   const duplicateError = Object.create(
  MongoServerError.prototype,
) as MongoServerError;

duplicateError.code = 11000;

mockInsertOne.mockRejectedValue(
  duplicateError,
);

    const event = {
      eventId: "event-duplicate",
      eventType: "attempt.succeeded" as const,
      tenantId: "tenant-001",
      studentId: "student-001",
      attemptId: "attempt-001",
      requestId: "request-001",
      occurredAt: new Date(),
      metadata: {
        score: 85,
      },
    };

    await expect(
      appendOperationalEvent(event),
    ).resolves.toBeUndefined();

    expect(mockInsertOne).toHaveBeenCalledTimes(1);
  });

  it("propagates unexpected MongoDB errors", async () => {
    const mongoError = new Error(
      "MongoDB unavailable",
    );

    mockInsertOne.mockRejectedValue(mongoError);

    const event = {
      eventId: "event-error",
      eventType: "attempt.rejected" as const,
      tenantId: "tenant-001",
      studentId: "student-001",
      requestId: "request-001",
      occurredAt: new Date(),
      metadata: {
        reason: "database failure",
      },
    };

    await expect(
      appendOperationalEvent(event),
    ).rejects.toThrow("MongoDB unavailable");
  });
});