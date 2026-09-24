import { MongoClient } from "mongodb";

const mongoUrl = process.env.MONGODB_URL;

if (!mongoUrl) {
  throw new Error("MONGODB_URL is not defined");
}

export const mongoClient = new MongoClient(mongoUrl);

export const mongoDatabase = mongoClient.db(
  process.env.MONGODB_DATABASE ?? "student_readiness_events",
);

export const operationalEvents =
  mongoDatabase.collection("operational_events");

export async function initializeMongo() {
  await operationalEvents.createIndex(
    { eventId: 1 },
    {
      unique: true,
      name: "uq_operational_events_event_id",
    },
  );

  await operationalEvents.createIndex(
    { tenantId: 1, studentId: 1, occurredAt: -1 },
    {
      name: "idx_operational_events_tenant_student_occurred",
    },
  );
}