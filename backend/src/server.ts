import "dotenv/config";

import app from "./app.js";
import {
  initializeMongo,
  mongoClient,
} from "./lib/mongo.js";

const PORT = Number(process.env.PORT ?? 3000);

async function startServer() {
  await mongoClient.connect();

  await initializeMongo();

  console.log("🍃 MongoDB connected");
  console.log("📌 MongoDB indexes initialized");

  app.listen(PORT, () => {
    console.log(
      `🚀 Server running on http://localhost:${PORT}`,
    );
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});