import { describe, expect, it, vi } from "vitest";

const { mockAppendOperationalEvent } = vi.hoisted(() => ({
  mockAppendOperationalEvent: vi.fn(),
}));

vi.mock("../services/event.service.js", () => ({
  appendOperationalEvent: mockAppendOperationalEvent,
  createRequestId: vi.fn(() => "test-request-id"),
  createEventId: vi.fn(() => "test-event-id"),
}));

import request from "supertest";
import app from "../app.js";

const TENANT_A_ID = "550e8400-e29b-41d4-a716-446655440000";

const ADMIN_EMAIL = "admin@tenant-a.com";
const ADMIN_PASSWORD = "Password@123";

async function getAdminToken(): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({
      tenantId: TENANT_A_ID,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

  expect(response.status).toBe(200);
  expect(response.body.data.accessToken).toBeTruthy();

  return response.body.data.accessToken;
}

async function getStudentId(token: string): Promise<string> {
  const response = await request(app)
    .get("/api/students")
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(200);

  const students = response.body.data;

  expect(Array.isArray(students)).toBe(true);
  expect(students.length).toBeGreaterThan(0);

  return students[0].id;
}

async function getCompetencyId(token: string): Promise<string> {
  const studentId = await getStudentId(token);

  const response = await request(app)
    .get(`/api/students/${studentId}`)
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(200);

  const data = response.body.data;

  const possibleCompetencies =
    data.competencies ??
    data.student?.competencies ??
    data.readiness?.competencies ??
    data.readiness?.evidence;

  expect(Array.isArray(possibleCompetencies)).toBe(true);
  expect(possibleCompetencies.length).toBeGreaterThan(0);

  const competency = possibleCompetencies[0];

  const competencyId =
    competency.competencyId ??
    competency.competency?.id ??
    competency.id;

  expect(competencyId).toBeTruthy();

  return competencyId;
}

/**
 * Extract the attempt ID without assuming
 * one exact response shape.
 */
function getAttemptId(body: any): string {
  const attemptId =
    body?.data?.attempt?.id ??
    body?.data?.attemptId ??
    body?.data?.id ??
    body?.attempt?.id ??
    body?.attemptId ??
    body?.id;

  expect(attemptId).toBeTruthy();

  return attemptId;
}

/**
 * Extract an API error message from the response.
 */
function getErrorMessage(body: any): string {
  const message =
    body?.error?.message ??
    body?.error ??
    body?.message ??
    body?.data?.error?.message ??
    body?.data?.error;

  expect(message).toBeTruthy();

  return String(message);
}

describe("Attempt idempotency API", () => {
  it("returns the same attempt for the same idempotency key and request", async () => {
    const token = await getAdminToken();

    const studentId = await getStudentId(token);

    const competencyId = await getCompetencyId(token);

    const idempotencyKey =
      `test-idempotency-${Date.now()}-same`;

    const payload = {
      competencyId,
      score: 90,
    };

    const firstResponse = await request(app)
      .post(`/api/students/${studentId}/attempts`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);

    expect(firstResponse.status).toBe(201);
    expect(firstResponse.body.data).toBeDefined();

    const firstAttemptId = getAttemptId(
      firstResponse.body,
    );

    const secondResponse = await request(app)
      .post(`/api/students/${studentId}/attempts`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);

    expect(secondResponse.status).toBe(201);
    expect(secondResponse.body.data).toBeDefined();

    const secondAttemptId = getAttemptId(
      secondResponse.body,
    );

    expect(secondAttemptId).toBe(firstAttemptId);
  });

  it("returns 409 when the same idempotency key is reused with a different request", async () => {
    const token = await getAdminToken();

    const studentId = await getStudentId(token);

    const competencyId = await getCompetencyId(token);

    const idempotencyKey =
      `test-idempotency-${Date.now()}-different`;

    const firstPayload = {
      competencyId,
      score: 80,
    };

    const secondPayload = {
      competencyId,
      score: 70,
    };

    const firstResponse = await request(app)
      .post(`/api/students/${studentId}/attempts`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(firstPayload);

    expect(firstResponse.status).toBe(201);

    const secondResponse = await request(app)
      .post(`/api/students/${studentId}/attempts`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(secondPayload);

    expect(secondResponse.status).toBe(409);

    const errorMessage = getErrorMessage(
      secondResponse.body,
    );

    expect(errorMessage).toBe(
      "Idempotency key was already used with a different request",
    );
  });

  it("handles concurrent identical requests with one logical result", async () => {
    const token = await getAdminToken();

    const studentId = await getStudentId(token);

    const competencyId = await getCompetencyId(token);

    const idempotencyKey =
      `test-idempotency-${Date.now()}-concurrent`;

    const payload = {
      competencyId,
      score: 95,
    };

    const request1 = request(app)
      .post(`/api/students/${studentId}/attempts`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);

    const request2 = request(app)
      .post(`/api/students/${studentId}/attempts`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);

    const [response1, response2] = await Promise.all([
      request1,
      request2,
    ]);

    expect(response1.status).toBe(201);
    expect(response2.status).toBe(201);

    expect(response1.body.data).toBeDefined();
    expect(response2.body.data).toBeDefined();

    const attemptId1 = getAttemptId(
      response1.body,
    );

    const attemptId2 = getAttemptId(
      response2.body,
    );

    expect(attemptId1).toBe(attemptId2);
  });

  it("returns 503 when MongoDB event publishing fails", async () => {
    const token = await getAdminToken();

    const studentId = await getStudentId(token);

    const competencyId = await getCompetencyId(token);

    const idempotencyKey =
      `test-mongo-failure-${Date.now()}`;

    const payload = {
      competencyId,
      score: 75,
    };

    mockAppendOperationalEvent.mockRejectedValueOnce(
      new Error("Simulated MongoDB outage"),
    );

    const response = await request(app)
      .post(`/api/students/${studentId}/attempts`)
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);

    expect(response.status).toBe(503);

    const errorMessage = getErrorMessage(
      response.body,
    );

    expect(errorMessage).toContain(
      "operational event",
    );
  });
});