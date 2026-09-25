import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    student: {
      findFirst: vi.fn(),
    },
    competency: {
      findMany: vi.fn(),
    },
    attempt: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: mockPrisma,
}));

import {
  calculateStudentReadiness,
} from "../services/readiness.service.js";

const studentId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";
const competencyId = "33333333-3333-4333-8333-333333333333";
const attemptId = "44444444-4444-4444-8444-444444444444";
const evaluatorId = "55555555-5555-4555-8555-555555555555";

function setup(score: number) {
  mockPrisma.student.findFirst.mockResolvedValue({
    id: studentId,
  });

  mockPrisma.competency.findMany.mockResolvedValue([
    {
      id: competencyId,
      key: "FRONTEND",
      name: "Frontend",
      weight: 1,
    },
  ]);

  mockPrisma.attempt.findMany.mockResolvedValue([
    {
      id: attemptId,
      studentId,
      competencyId,
      evaluatorId,
      score,
      submittedAt: new Date("2026-09-25T10:00:00.000Z"),
      voided: false,
      competency: {
        id: competencyId,
        key: "FRONTEND",
        name: "Frontend",
        weight: 1,
      },
      evaluator: {
        id: evaluatorId,
        name: "Test Evaluator",
        email: "evaluator@test.com",
      },
    },
  ]);
}

describe("Student readiness calculation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns INCOMPLETE when a required competency is missing", async () => {
    mockPrisma.student.findFirst.mockResolvedValue({
      id: studentId,
    });

    mockPrisma.competency.findMany.mockResolvedValue([
      {
        id: competencyId,
        key: "FRONTEND",
        name: "Frontend",
        weight: 1,
      },
    ]);

    mockPrisma.attempt.findMany.mockResolvedValue([]);

    const result = await calculateStudentReadiness(
      studentId,
      tenantId,
    );

    expect(result.status).toBe("INCOMPLETE");
    expect(result.score).toBeNull();
  });

  it("returns NEEDS_PREPARATION below 50", async () => {
    setup(49.9);

    const result = await calculateStudentReadiness(
      studentId,
      tenantId,
    );

    expect(result.score).toBeCloseTo(49.9);
    expect(result.status).toBe("NEEDS_PREPARATION");
  });

  it("returns DEVELOPING at exactly 50", async () => {
    setup(50);

    const result = await calculateStudentReadiness(
      studentId,
      tenantId,
    );

    expect(result.score).toBe(50);
    expect(result.status).toBe("DEVELOPING");
  });

  it("returns DEVELOPING below 65", async () => {
    setup(64.9);

    const result = await calculateStudentReadiness(
      studentId,
      tenantId,
    );

    expect(result.score).toBeCloseTo(64.9);
    expect(result.status).toBe("DEVELOPING");
  });

  it("returns NEARLY_READY at exactly 65", async () => {
    setup(65);

    const result = await calculateStudentReadiness(
      studentId,
      tenantId,
    );

    expect(result.score).toBe(65);
    expect(result.status).toBe("NEARLY_READY");
  });

  it("returns NEARLY_READY below 80", async () => {
    setup(79.9);

    const result = await calculateStudentReadiness(
      studentId,
      tenantId,
    );

    expect(result.score).toBeCloseTo(79.9);
    expect(result.status).toBe("NEARLY_READY");
  });

  it("returns READY at exactly 80", async () => {
    setup(80);

    const result = await calculateStudentReadiness(
      studentId,
      tenantId,
    );

    expect(result.score).toBe(80);
    expect(result.status).toBe("READY");
  });

  it("returns READY above 80", async () => {
    setup(95);

    const result = await calculateStudentReadiness(
      studentId,
      tenantId,
    );

    expect(result.score).toBe(95);
    expect(result.status).toBe("READY");
  });

    it("uses the larger attempt ID when submittedAt values are identical", async () => {
    const firstAttemptId =
      "44444444-4444-4444-8444-444444444444";

    const secondAttemptId =
      "55555555-5555-4555-8555-555555555555";

    const sameSubmittedAt =
      new Date("2026-09-25T10:00:00.000Z");

    mockPrisma.student.findFirst.mockResolvedValue({
      id: studentId,
    });

    mockPrisma.competency.findMany.mockResolvedValue([
      {
        id: competencyId,
        key: "FRONTEND",
        name: "Frontend",
        weight: 1,
      },
    ]);

    mockPrisma.attempt.findMany.mockResolvedValue([
      {
        id: secondAttemptId,
        studentId,
        competencyId,
        evaluatorId,
        score: 80,
        submittedAt: sameSubmittedAt,
        voided: false,
        competency: {
          id: competencyId,
          key: "FRONTEND",
          name: "Frontend",
          weight: 1,
        },
        evaluator: {
          id: evaluatorId,
          name: "Test Evaluator",
          email: "evaluator@test.com",
        },
      },
      {
        id: firstAttemptId,
        studentId,
        competencyId,
        evaluatorId,
        score: 40,
        submittedAt: sameSubmittedAt,
        voided: false,
        competency: {
          id: competencyId,
          key: "FRONTEND",
          name: "Frontend",
          weight: 1,
        },
        evaluator: {
          id: evaluatorId,
          name: "Test Evaluator",
          email: "evaluator@test.com",
        },
      },
    ]);

    const result = await calculateStudentReadiness(
      studentId,
      tenantId,
    );

    const competency = result.competencies[0];

    expect(competency).toBeDefined();

    if (!competency) {
      return;
    }

    expect(competency.score).toBe(80);

    expect(
      competency.latestAttempt?.id,
    ).toBe(secondAttemptId);
  });
    it("requests latest attempts ordered by submittedAt desc and id desc", async () => {
    setup(80);

    await calculateStudentReadiness(
      studentId,
      tenantId,
    );

    expect(
      mockPrisma.attempt.findMany,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          studentId,
          voided: false,
        },
        orderBy: [
          {
            submittedAt: "desc",
          },
          {
            id: "desc",
          },
        ],
        include: expect.any(Object),
      }),
    );
  });
});