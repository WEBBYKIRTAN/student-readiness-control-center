import type {
  NextFunction,
  Request,
  Response,
} from "express";

import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

export type AuthenticatedUser = {
  userId: string;
  tenantId: string;
  role: "ADMIN" | "EVALUATOR" | "VIEWER";
};

export type AuthenticatedRequest =
  Request & {
    user?: AuthenticatedUser;
  };

export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const authorization =
    req.headers.authorization;

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    res.status(401).json({
      error: "Authentication required",
    });

    return;
  }

  const token =
    authorization.substring("Bearer ".length);

  try {
    const decoded = jwt.verify(
      token,
      env.jwtSecret,
    );

    if (
      typeof decoded !== "object" ||
      decoded === null
    ) {
      res.status(401).json({
        error: "Invalid authentication token",
      });

      return;
    }

    const userId = decoded.userId;
    const tenantId = decoded.tenantId;
    const role = decoded.role;

    if (
      typeof userId !== "string" ||
      typeof tenantId !== "string" ||
      typeof role !== "string"
    ) {
      res.status(401).json({
        error: "Invalid authentication token",
      });

      return;
    }

    if (
      role !== "ADMIN" &&
      role !== "EVALUATOR" &&
      role !== "VIEWER"
    ) {
      res.status(401).json({
        error: "Invalid authentication token",
      });

      return;
    }

    req.user = {
      userId,
      tenantId,
      role,
    };

    next();
  } catch {
    res.status(401).json({
      error: "Invalid or expired authentication token",
    });
  }
}