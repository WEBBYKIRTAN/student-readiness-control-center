import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../app.js";

const TENANT_A_ID =
  "550e8400-e29b-41d4-a716-446655440000";

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

function getStudentVersion(body: any): number {
  const version =
    body?.data?.version ??
    body?.data?.student?.version ??
    body?.student?.version;

  expect(version).toBeDefined();
  expect(typeof version).toBe("number");

  return version;
}

describe("Optimistic concurrency control", () => {
  it("rejects one of two concurrent updates using the same version", async () => {
    const token = await getAdminToken();

    const studentId = await getStudentId(token);

    const studentResponse = await request(app)
      .get(`/api/students/${studentId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(studentResponse.status).toBe(200);

    const currentVersion =
      getStudentVersion(studentResponse.body);

    expect(currentVersion).toBeGreaterThanOrEqual(1);

    const update1 = request(app)
      .patch(`/api/students/${studentId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Concurrent Update A",
        version: currentVersion,
      });

    const update2 = request(app)
      .patch(`/api/students/${studentId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Concurrent Update B",
        version: currentVersion,
      });

    const [response1, response2] = await Promise.all([
      update1,
      update2,
    ]);

    console.log(
      "UPDATE 1:",
      response1.status,
      JSON.stringify(response1.body, null, 2),
    );

    console.log(
      "UPDATE 2:",
      response2.status,
      JSON.stringify(response2.body, null, 2),
    );

    const statuses = [
      response1.status,
      response2.status,
    ].sort((a, b) => a - b);

    expect(statuses).toEqual([200, 409]);

    const successfulResponse =
      response1.status === 200
        ? response1
        : response2;

    const conflictResponse =
      response1.status === 409
        ? response1
        : response2;

    expect(successfulResponse.body.data).toBeDefined();
    expect(conflictResponse.body).toBeDefined();

    const finalResponse = await request(app)
      .get(`/api/students/${studentId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(finalResponse.status).toBe(200);

    const finalVersion =
      getStudentVersion(finalResponse.body);

    expect(finalVersion).toBe(
      currentVersion + 1,
    );
  });
});