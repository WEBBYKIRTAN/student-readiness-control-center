import type {
  ErrorRequestHandler,
  Request,
} from "express";

type AppError = Error & {
  statusCode?: number;
  code?: string;
  details?: unknown;
};

function getRequestId(req: Request): string {
  return String(
    req.res?.locals?.requestId ?? "unknown",
  );
}

export const errorMiddleware: ErrorRequestHandler = (
  error: AppError,
  req,
  res,
  _next,
) => {
  const requestId = getRequestId(req);

  const statusCode =
    typeof error?.statusCode === "number" &&
    error.statusCode >= 400 &&
    error.statusCode < 600
      ? error.statusCode
      : 500;

  const code =
    typeof error?.code === "string"
      ? error.code
      : statusCode === 500
        ? "INTERNAL_SERVER_ERROR"
        : "REQUEST_ERROR";

  const message =
    statusCode === 500
      ? "An unexpected error occurred"
      : error.message || "Request failed";

  /*
   * Expected application errors are not unexpected server failures.
   * Log them as warnings so operational logs remain meaningful.
   */
  if (statusCode >= 400 && statusCode < 500) {
    console.warn("Request rejected", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      code,
      statusCode,
    });
  } else {
    console.error("Unhandled request error", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      error:
        error instanceof Error
          ? error.message
          : String(error),
    });
  }

  const response: {
    error: {
      code: string;
      message: string;
      requestId: string;
      details?: unknown;
    };
  } = {
    error: {
      code,
      message,
      requestId,
    },
  };

  if (
    error.details !== undefined &&
    statusCode >= 400 &&
    statusCode < 500
  ) {
    response.error.details = error.details;
  }

  res.status(statusCode).json(response);
};