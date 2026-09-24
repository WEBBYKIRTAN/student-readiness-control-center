import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../app.js";

const TENANT_A_ID =
  "550e8400-e29b-41d4-a716-446655440000";

const TENANT_B_ID =
  "550e8400-e29b-41d4-a716-446655440001";

const TENANT_A_ADMIN =
  "admin@tenant-a.com";

const TENANT_B_ADMIN =
  "admin@tenant-b.com";

const PASSWORD = "Password@123";

const TENANT_A_STUDENT_EMAIL =
  "alice@tenant-a.com";

const TENANT_B_STUDENT_EMAIL =
  "charlie@tenant-b.com";

async function getAccessToken(
  tenantId: string,
  email: string
): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({
      tenantId,
      email,
      password: PASSWORD,
    });

  expect(response.status).toBe(200);
  expect(response.body.data.accessToken).toBeTruthy();

  return response.body.data.accessToken;
}

async function getStudentId(
  token: string,
  email: string
): Promise<string> {
  const response = await request(app)
    .get("/api/students")
    .set("Authorization", `Bearer ${token}`)
    .query({
      search: email,
      page: 1,
      pageSize: 20,
    });

  expect(response.status).toBe(200);

  const student = response.body.data.find(
    (item: { email: string }) =>
      item.email === email
  );

  expect(student).toBeTruthy();

  return student.id;
}

describe("Tenant isolation security", () => {
  it(
    "prevents Tenant A from reading Tenant B student",
    async () => {
      const tenantAToken = await getAccessToken(
        TENANT_A_ID,
        TENANT_A_ADMIN
      );

      const tenantBToken = await getAccessToken(
        TENANT_B_ID,
        TENANT_B_ADMIN
      );

      const tenantBStudentId =
        await getStudentId(
          tenantBToken,
          TENANT_B_STUDENT_EMAIL
        );

      const response = await request(app)
        .get(
          `/api/students/${tenantBStudentId}`
        )
        .set(
          "Authorization",
          `Bearer ${tenantAToken}`
        );

      expect(response.status).toBe(404);

      expect(response.body.error).toBe(
        "Student not found"
      );
    },
    15000
  );

  it(
    "prevents Tenant A from modifying Tenant B student",
    async () => {
      const tenantAToken = await getAccessToken(
        TENANT_A_ID,
        TENANT_A_ADMIN
      );

      const tenantBToken = await getAccessToken(
        TENANT_B_ID,
        TENANT_B_ADMIN
      );

      const tenantBStudentId =
        await getStudentId(
          tenantBToken,
          TENANT_B_STUDENT_EMAIL
        );

      const beforeResponse = await request(app)
        .get(
          `/api/students/${tenantBStudentId}`
        )
        .set(
          "Authorization",
          `Bearer ${tenantBToken}`
        );

      expect(beforeResponse.status).toBe(200);

      const version =
        beforeResponse.body.data.version;

      const response = await request(app)
        .patch(
          `/api/students/${tenantBStudentId}`
        )
        .set(
          "Authorization",
          `Bearer ${tenantAToken}`
        )
        .send({
          name: "Unauthorized Tenant A Update",
          version,
        });

      expect(response.status).toBe(404);

      expect(response.body.error).toBe(
        "Student not found"
      );

      const afterResponse = await request(app)
        .get(
          `/api/students/${tenantBStudentId}`
        )
        .set(
          "Authorization",
          `Bearer ${tenantBToken}`
        );

      expect(afterResponse.status).toBe(200);

      expect(afterResponse.body.data.name).not.toBe(
        "Unauthorized Tenant A Update"
      );
    },
    15000
  );
});