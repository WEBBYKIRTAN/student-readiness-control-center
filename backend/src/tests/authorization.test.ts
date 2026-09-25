import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../app.js";

const TENANT_A_ID = "550e8400-e29b-41d4-a716-446655440000";

const VIEWER_EMAIL = "viewer@tenant-a.com";
const VIEWER_PASSWORD = "Password@123";

const ADMIN_EMAIL = "admin@tenant-a.com";
const ADMIN_PASSWORD = "Password@123";

async function getAccessToken(
  email: string,
  password: string,
) {
  const response = await request(app)
    .post("/api/auth/login")
    .send({
      tenantId: TENANT_A_ID,
      email,
      password,
    });

  expect(response.status).toBe(200);

  return response.body.data.accessToken as string;
}

async function getStudentId(token: string) {
  const response = await request(app)
    .get("/api/students")
    .set("Authorization", `Bearer ${token}`);

  expect(response.status).toBe(200);

  expect(response.body.data).toBeDefined();
  expect(response.body.data.length).toBeGreaterThan(0);

  return response.body.data[0].id as string;
}

describe("Role authorization", () => {
  it("allows VIEWER to read students", async () => {
    const viewerToken = await getAccessToken(
      VIEWER_EMAIL,
      VIEWER_PASSWORD,
    );

    const response = await request(app)
      .get("/api/students")
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(response.status).toBe(200);
  });

  it("allows VIEWER to read student details", async () => {
    const viewerToken = await getAccessToken(
      VIEWER_EMAIL,
      VIEWER_PASSWORD,
    );

    const studentId = await getStudentId(viewerToken);

    const response = await request(app)
      .get(`/api/students/${studentId}`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(response.status).toBe(200);
  });

  it("allows VIEWER to read student activity", async () => {
    const viewerToken = await getAccessToken(
      VIEWER_EMAIL,
      VIEWER_PASSWORD,
    );

    const studentId = await getStudentId(viewerToken);

    const response = await request(app)
      .get(`/api/students/${studentId}/activity`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(response.status).toBe(200);
  },15000);

  it("rejects VIEWER from updating a student", async () => {
    const viewerToken = await getAccessToken(
      VIEWER_EMAIL,
      VIEWER_PASSWORD,
    );

    const studentId = await getStudentId(viewerToken);

    const studentResponse = await request(app)
      .get(`/api/students/${studentId}`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(studentResponse.status).toBe(200);

    const currentVersion = studentResponse.body.data.version;

    const response = await request(app)
      .patch(`/api/students/${studentId}`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({
        name: "Unauthorized Viewer Update",
        version: currentVersion,
      });

    expect(response.status).toBe(403);
  });

  it("rejects VIEWER from submitting an attempt", async () => {
    const viewerToken = await getAccessToken(
      VIEWER_EMAIL,
      VIEWER_PASSWORD,
    );

    const studentId = await getStudentId(viewerToken);

    const response = await request(app)
      .post(`/api/students/${studentId}/attempts`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .set("Idempotency-Key", `viewer-test-${Date.now()}`)
      .send({
        competencyId: "9f32204e-12bc-4f01-a88b-506be5c693ba",
        score: 90,
      });

    expect(response.status).toBe(403);
  });

  it("allows ADMIN to update a student", async () => {
    const adminToken = await getAccessToken(
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
    );

    const studentId = await getStudentId(adminToken);

    const studentResponse = await request(app)
      .get(`/api/students/${studentId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(studentResponse.status).toBe(200);

    const currentVersion = studentResponse.body.data.version;

    const response = await request(app)
      .patch(`/api/students/${studentId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: studentResponse.body.data.name,
        version: currentVersion,
      });

    expect(response.status).toBe(200);
  });
});