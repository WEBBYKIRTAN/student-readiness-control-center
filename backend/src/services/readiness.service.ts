import { prisma } from "../lib/prisma.js";

export const READINESS_STATUSES = [
  "INCOMPLETE",
  "READY",
  "NEARLY_READY",
  "DEVELOPING",
  "NEEDS_PREPARATION",
] as const;

export type ReadinessStatus = (typeof READINESS_STATUSES)[number];

export type LatestAttemptEvidence = {
  id: string;
  score: number;
  submittedAt: string;
  evaluatorId: string;
  evaluatorName: string;
  evaluatorEmail: string;
};

export type CompetencyReadiness = {
  competencyId: string;
  key: string;
  name: string;
  weight: number;
  score: number | null;
  latestAttempt: LatestAttemptEvidence | null;
};

export type StudentReadiness = {
  score: number | null;
  status: ReadinessStatus;
  competencies: CompetencyReadiness[];
};

export async function calculateStudentReadiness(
  studentId: string,
  tenantId: string,
): Promise<StudentReadiness> {
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId,
    },
    select: {
      id: true,
    },
  });

  if (!student) {
    throw new Error("STUDENT_NOT_FOUND");
  }

  const [competencies, attempts] = await Promise.all([
    prisma.competency.findMany({
      orderBy: {
        key: "asc",
      },
    }),

    prisma.attempt.findMany({
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

      include: {
        competency: true,

        evaluator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  /*
   * Because attempts are ordered by:
   *
   *   1. submittedAt DESC
   *   2. id DESC
   *
   * the first attempt encountered for each competency
   * is the latest valid attempt.
   */
  const latestAttempts = new Map<
    string,
    (typeof attempts)[number]
  >();

  for (const attempt of attempts) {
    if (!latestAttempts.has(attempt.competencyId)) {
      latestAttempts.set(attempt.competencyId, attempt);
    }
  }

  const competencyResults: CompetencyReadiness[] =
    competencies.map((competency) => {
      const latestAttempt =
        latestAttempts.get(competency.id);

      return {
        competencyId: competency.id,
        key: competency.key,
        name: competency.name,
        weight: competency.weight,

        score: latestAttempt?.score ?? null,

        latestAttempt: latestAttempt
          ? {
              id: latestAttempt.id,
              score: latestAttempt.score,
              submittedAt:
                latestAttempt.submittedAt.toISOString(),
              evaluatorId: latestAttempt.evaluator.id,
              evaluatorName:
                latestAttempt.evaluator.name,
              evaluatorEmail:
                latestAttempt.evaluator.email,
            }
          : null,
      };
    });

  /*
   * A student cannot receive a readiness score until
   * every required competency has a latest attempt.
   */
  const missingCompetency = competencyResults.some(
    (competency) => competency.score === null,
  );

  if (missingCompetency) {
    return {
      score: null,
      status: "INCOMPLETE",
      competencies: competencyResults,
    };
  }

  /*
   * Weighted readiness score.
   */
  const score = competencyResults.reduce(
    (total, competency) =>
      total +
      (competency.score ?? 0) * competency.weight,
    0,
  );

  let status: ReadinessStatus;

  if (score >= 80) {
    status = "READY";
  } else if (score >= 65) {
    status = "NEARLY_READY";
  } else if (score >= 50) {
    status = "DEVELOPING";
  } else {
    status = "NEEDS_PREPARATION";
  }

  return {
    score,
    status,
    competencies: competencyResults,
  };
}