import { prisma } from "../lib/prisma.js";

type SubmitAttemptInput = {
  tenantId: string;
  evaluatorId: string;
  studentId: string;
  competencyId: string;
  score: number;
  submittedAt?: Date;
};

export async function submitAttempt(input: SubmitAttemptInput) {
  const {
    tenantId,
    evaluatorId,
    studentId,
    competencyId,
    score,
    submittedAt,
  } = input;

  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId,
    },
  });

  if (!student) {
    throw new Error("STUDENT_NOT_FOUND");
  }

  const evaluator = await prisma.user.findFirst({
    where: {
      id: evaluatorId,
      tenantId,
    },
  });

  if (!evaluator) {
    throw new Error("EVALUATOR_NOT_FOUND");
  }

  if (
    evaluator.role !== "ADMIN" &&
    evaluator.role !== "EVALUATOR"
  ) {
    throw new Error("FORBIDDEN");
  }

  const competency = await prisma.competency.findUnique({
    where: {
      id: competencyId,
    },
  });

  if (!competency) {
    throw new Error("COMPETENCY_NOT_FOUND");
  }

  const attempt = await prisma.attempt.create({
    data: {
      studentId,
      competencyId,
      evaluatorId,
      score,
      ...(submittedAt ? { submittedAt } : {}),
    },
    include: {
      competency: true,
    },
  });

  return attempt;
}