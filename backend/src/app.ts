import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import studentRoutes from "./routes/students.routes.js";
import { requestIdMiddleware } from "./middleware/request-id.middleware.js";
import { errorMiddleware } from "./middleware/error.middleware.js";

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

app.use(express.json());

app.use(requestIdMiddleware);

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Student Readiness Control Center API is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);

/*
 * Global error handler.
 *
 * This MUST be registered after all routes.
 */
app.use(errorMiddleware);

export default app;