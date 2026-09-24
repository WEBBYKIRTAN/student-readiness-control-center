import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function main() {
  console.log("🌱 Starting database seed...");

  // --------------------------------------------------
  // 1. Clean development data
  // --------------------------------------------------

  console.log("🧹 Cleaning existing development data...");

  await prisma.idempotencyRecord.deleteMany();
  await prisma.attempt.deleteMany();
  await prisma.student.deleteMany();
  await prisma.user.deleteMany();
  await prisma.competency.deleteMany();
  await prisma.tenant.deleteMany();

  // --------------------------------------------------
  // 2. Competencies
  // --------------------------------------------------

  const frontend = await prisma.competency.create({
    data: {
      key: "frontend",
      name: "Frontend",
      weight: 0.3,
    },
  });

  const backend = await prisma.competency.create({
    data: {
      key: "backend",
      name: "Backend",
      weight: 0.3,
    },
  });

  const databases = await prisma.competency.create({
    data: {
      key: "databases",
      name: "Databases",
      weight: 0.25,
    },
  });

  const problemSolving = await prisma.competency.create({
    data: {
      key: "problem-solving",
      name: "Problem Solving",
      weight: 0.15,
    },
  });

  console.log("✅ Competencies created");

  // --------------------------------------------------
  // 3. Tenants
  // --------------------------------------------------

  const tenantA = await prisma.tenant.create({
    data: {
      id: "550e8400-e29b-41d4-a716-446655440000",
      name: "Training Organization A",
      status: "ACTIVE",
    },
  });

  const tenantB = await prisma.tenant.create({
    data: {
      id: "550e8400-e29b-41d4-a716-446655440001",
      name: "Training Organization B",
      status: "ACTIVE",
    },
  });

  console.log("✅ Tenants created");

  // --------------------------------------------------
  // 4. Password
  // --------------------------------------------------

  const passwordHash = await bcrypt.hash(
    "Password@123",
    12
  );

  // --------------------------------------------------
  // 5. Users
  // --------------------------------------------------
const adminA = await prisma.user.create({
  data: {
    tenantId: tenantA.id,
    email: "admin@tenant-a.com",
    name: "Training Organization A Admin",
    passwordHash,
    role: "ADMIN",
  },
});

const evaluatorA = await prisma.user.create({
  data: {
    tenantId: tenantA.id,
    email: "evaluator@tenant-a.com",
    name: "Training Organization A Evaluator",
    passwordHash,
    role: "EVALUATOR",
  },
});

const adminB = await prisma.user.create({
  data: {
    tenantId: tenantB.id,
    email: "admin@tenant-b.com",
    name: "Training Organization B Admin",
    passwordHash,
    role: "ADMIN",
  },
});

const viewerA = await prisma.user.create({
  data: {
    tenantId: tenantA.id,
    email: "viewer@tenant-a.com",
    name: "Training Organization A Viewer",
    passwordHash,
    role: "VIEWER",
  },
});

console.log("✅ Users created");

  // --------------------------------------------------
  // 6. Students
  // --------------------------------------------------

  const studentA1 = await prisma.student.create({
    data: {
      tenantId: tenantA.id,
      name: "Alice Johnson",
      email: "alice@tenant-a.com",
    },
  });

  const studentA2 = await prisma.student.create({
    data: {
      tenantId: tenantA.id,
      name: "Bob Smith",
      email: "bob@tenant-a.com",
    },
  });

  const studentB1 = await prisma.student.create({
    data: {
      tenantId: tenantB.id,
      name: "Charlie Brown",
      email: "charlie@tenant-b.com",
    },
  });

  console.log("✅ Students created");

  // --------------------------------------------------
  // 7. Attempts - Tenant A / Alice
  // --------------------------------------------------

  await prisma.attempt.createMany({
    data: [
      {
        studentId: studentA1.id,
        competencyId: frontend.id,
        evaluatorId: evaluatorA.id,
        score: 85,
      },
      {
        studentId: studentA1.id,
        competencyId: backend.id,
        evaluatorId: evaluatorA.id,
        score: 80,
      },
      {
        studentId: studentA1.id,
        competencyId: databases.id,
        evaluatorId: evaluatorA.id,
        score: 75,
      },
      {
        studentId: studentA1.id,
        competencyId: problemSolving.id,
        evaluatorId: evaluatorA.id,
        score: 90,
      },
    ],
  });

  // --------------------------------------------------
  // 8. Attempts - Tenant A / Bob
  // --------------------------------------------------

  await prisma.attempt.createMany({
    data: [
      {
        studentId: studentA2.id,
        competencyId: frontend.id,
        evaluatorId: evaluatorA.id,
        score: 65,
      },
      {
        studentId: studentA2.id,
        competencyId: backend.id,
        evaluatorId: evaluatorA.id,
        score: 60,
      },
    ],
  });

  // --------------------------------------------------
  // 9. Attempts - Tenant B / Charlie
  // --------------------------------------------------

  await prisma.attempt.createMany({
    data: [
      {
        studentId: studentB1.id,
        competencyId: frontend.id,
        evaluatorId: adminB.id,
        score: 90,
      },
      {
        studentId: studentB1.id,
        competencyId: backend.id,
        evaluatorId: adminB.id,
        score: 85,
      },
      {
        studentId: studentB1.id,
        competencyId: databases.id,
        evaluatorId: adminB.id,
        score: 80,
      },
      {
        studentId: studentB1.id,
        competencyId: problemSolving.id,
        evaluatorId: adminB.id,
        score: 85,
      },
    ],
  });

  console.log("✅ Attempts created");

  // --------------------------------------------------
  // 10. Summary
  // --------------------------------------------------

  console.log("");
  console.log("========================================");
  console.log("🌱 SEED COMPLETED SUCCESSFULLY");
  console.log("========================================");

  console.log("");
  console.log("Tenant A:");
  console.log(
    "ID:",
    tenantA.id
  );

  console.log("");
  console.log("Tenant B:");
  console.log(
    "ID:",
    tenantB.id
  );

  console.log("");
  console.log("Login accounts:");
  console.log(
    "Tenant A Admin:",
    "admin@tenant-a.com / Password@123"
  );

  console.log(
    "Tenant A Evaluator:",
    "evaluator@tenant-a.com / Password@123"
  );

  console.log(
    "Tenant B Admin:",
    "admin@tenant-b.com / Password@123"
  );

  console.log("");
  console.log("Students:");
  console.log(
    "Tenant A:",
    studentA1.name,
    studentA2.name
  );

  console.log(
    "Tenant B:",
    studentB1.name
  );

  console.log("");
  console.log("Competencies:");
  console.log("Frontend: 30%");
  console.log("Backend: 30%");
  console.log("Databases: 25%");
  console.log("Problem Solving: 15%");
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });