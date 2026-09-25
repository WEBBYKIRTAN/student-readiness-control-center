import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const incomingRequestId = req.header("X-Request-Id");

  const requestId =
    incomingRequestId &&
    incomingRequestId.length <= 128
      ? incomingRequestId
      : randomUUID();

  res.locals.requestId = requestId;

  res.setHeader("X-Request-Id", requestId);

  next();
}