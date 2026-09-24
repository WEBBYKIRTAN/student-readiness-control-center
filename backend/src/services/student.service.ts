import { prisma } from "../lib/prisma.js";

type UpdateStudentInput = {
  tenantId: string;
  studentId: string;
  name?: string;
  email?: string;
  expectedVersion: number;
};

export async function updateStudent(
  input: UpdateStudentInput,
) {
  const {
    tenantId,
    studentId,
    name,
    email,
    expectedVersion,
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

  if (student.version !== expectedVersion) {
    throw new Error("VERSION_CONFLICT");
  }

  const data: {
    name?: string;
    email?: string;
    version: number;
  } = {
    version: expectedVersion + 1,
  };

  if (name !== undefined) {
    data.name = name;
  }

  if (email !== undefined) {
    data.email = email;
  }

  const result = await prisma.student.updateMany({
    where: {
      id: studentId,
      tenantId,
      version: expectedVersion,
    },
    data,
  });

  if (result.count !== 1) {
    throw new Error("VERSION_CONFLICT");
  }

  return prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId,
    },
  });
}