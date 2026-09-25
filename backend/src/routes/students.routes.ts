import { Router } from "express";
import { z } from "zod";
import { Prisma } from "../generated/prisma/client.js";

import { createRequestFingerprint } from "../utils/idempotency.js";
import { AppError } from "../utils/app-error.js";
import { operationalEvents } from "../lib/mongo.js";

import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/auth.js";

import { prisma } from "../lib/prisma.js";

import {
  calculateStudentReadiness,
  READINESS_STATUSES,
} from "../services/readiness.service.js";

import { createAttemptSchema } from "../validators/attempt.schema.js";
import { updateStudentSchema } from "../validators/student.schema.js";

import { updateStudent } from "../services/student.service.js";

import {
  appendOperationalEvent,
  createEventId,
  createRequestId,
} from "../services/event.service.js";

const router = Router();

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

type StoredAttemptResponse = {
  data: {
    id: string;
    studentId: string;
    competencyId: string;
    evaluatorId: string;
    score: number;
    submittedAt: string;
    voided: boolean;
    createdAt: string;
    competency: {
      id: string;
      key: string;
      name: string;
      weight: number;
      createdAt: string;
      updatedAt: string;
    };
  };
  eventId: string;
  requestId: string;
};

/*
|--------------------------------------------------------------------------
| GET /api/students
|--------------------------------------------------------------------------
*/

const studentListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),

  status: z.enum(READINESS_STATUSES).optional(),

  page: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(1),

  pageSize: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),
});

router.get(
  "/",
  authenticate,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const parsed = studentListQuerySchema.safeParse(req.query);
if (!parsed.success) {
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "Invalid query parameters",
    parsed.error.flatten(),
  );
}

      const {
        search,
        status,
        page,
        pageSize,
      } = parsed.data;

      const tenantId = req.user!.tenantId;

      const students = await prisma.student.findMany({
        where: {
          tenantId,

          ...(search
            ? {
                OR: [
                  {
                    name: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                  {
                    email: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                ],
              }
            : {}),
        },

        orderBy: [
          {
            name: "asc",
          },
          {
            id: "asc",
          },
        ],
      });

      const studentsWithReadiness = await Promise.all(
        students.map(async (student) => {
          const readiness = await calculateStudentReadiness(
            student.id,
            tenantId,
          );

          return {
            ...student,
            readinessScore: readiness.score,
            readinessStatus: readiness.status,
          };
        }),
      );

      const filteredStudents = status
        ? studentsWithReadiness.filter(
            (student) =>
              student.readinessStatus === status,
          )
        : studentsWithReadiness;

      const total = filteredStudents.length;

      const start = (page - 1) * pageSize;

      const paginatedStudents = filteredStudents.slice(
        start,
        start + pageSize,
      );

      res.status(200).json({
        data: paginatedStudents,

        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/*
|--------------------------------------------------------------------------
| POST /api/students/:id/attempts
|--------------------------------------------------------------------------
|
| Features:
| - Authentication
| - Tenant isolation
| - Role authorization
| - Request validation
| - Idempotency
| - Concurrent idempotency protection
| - PostgreSQL transaction
| - MongoDB operational event
| - Retry-safe event handling
|--------------------------------------------------------------------------
*/

router.post(
  "/:id/attempts",
  authenticate,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const studentId = req.params.id;

      if (typeof studentId !== "string") {
  throw new AppError(
    400,
    "INVALID_STUDENT_ID",
    "Invalid student ID",
  );
}

      /*
      |--------------------------------------------------------------------------
      | Idempotency-Key
      |--------------------------------------------------------------------------
      */

      const idempotencyKey =
        req.header("Idempotency-Key");

     if (!idempotencyKey) {
  throw new AppError(
    400,
    "IDEMPOTENCY_KEY_REQUIRED",
    "Idempotency-Key header is required",
  );
}
      if (
  idempotencyKey.length < 1 ||
  idempotencyKey.length > 128
) {
  throw new AppError(
    400,
    "INVALID_IDEMPOTENCY_KEY",
    "Invalid Idempotency-Key",
  );
}
      /*
      |--------------------------------------------------------------------------
      | Request validation
      |--------------------------------------------------------------------------
      */

      const parsed =
        createAttemptSchema.safeParse(req.body);

     if (!parsed.success) {
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "Invalid attempt request",
    parsed.error.flatten(),
  );
}

      /*
      |--------------------------------------------------------------------------
      | Authorization
      |--------------------------------------------------------------------------
      */

      if (
  req.user!.role !== "ADMIN" &&
  req.user!.role !== "EVALUATOR"
) {
  throw new AppError(
    403,
    "FORBIDDEN",
    "You are not allowed to submit attempts",
  );
}

      const tenantId = req.user!.tenantId;
      const evaluatorId = req.user!.userId;

      /*
      |--------------------------------------------------------------------------
      | Request fingerprint
      |--------------------------------------------------------------------------
      */

      const requestFingerprint =
        createRequestFingerprint({
          method: "POST",
          resource: `/api/students/${studentId}/attempts`,
          studentId,
          competencyId: parsed.data.competencyId,
          score: parsed.data.score,
          submittedAt:
            parsed.data.submittedAt ?? null,
        });

      const requestId = createRequestId();

      /*
      |--------------------------------------------------------------------------
      | Check existing idempotency record
      |--------------------------------------------------------------------------
      */

      const existingRecord =
        await prisma.idempotencyRecord.findUnique({
          where: {
            tenantId_key: {
              tenantId,
              key: idempotencyKey,
            },
          },
        });

      if (existingRecord !== null) {
        /*
        | Same key but different request
        */
       if (
  existingRecord.requestFingerprint !==
  requestFingerprint
) {
  throw new AppError(
    409,
    "IDEMPOTENCY_KEY_REUSED",
    "Idempotency key was already used with a different request",
  );
}

        /*
        | Same key + same request
        |
        | PostgreSQL attempt already exists.
        | Ensure MongoDB event exists.
        */

        const storedResponse =
          existingRecord.responseJson as unknown as StoredAttemptResponse;

        try {
          await appendOperationalEvent({
            eventId: storedResponse.eventId,
            eventType: "attempt.succeeded",
            tenantId,
            studentId,
            attemptId: storedResponse.data.id,
            requestId: storedResponse.requestId,
            occurredAt: new Date(),
            metadata: {
              competencyId:
                parsed.data.competencyId,
              score: parsed.data.score,
              replayed: true,
            },
          });
        } catch (eventError) {
          console.error(
            "Failed to replay attempt.succeeded event",
            eventError,
          );

          throw new AppError(
            503,
            "OPERATIONAL_EVENT_UNAVAILABLE",
            "Attempt already exists, but its operational event could not be recorded. Retry the same request.",
          );
        }

        res
          .status(existingRecord.responseStatus)
          .json({
            data: storedResponse.data,
          });

        return;
      }

      /*
      |--------------------------------------------------------------------------
      | New request
      |--------------------------------------------------------------------------
      */

      const eventId = createEventId();

      const attemptInput = {
        studentId,
        evaluatorId,
        competencyId: parsed.data.competencyId,
        score: parsed.data.score,

        ...(parsed.data.submittedAt
          ? {
              submittedAt: new Date(
                parsed.data.submittedAt,
              ),
            }
          : {}),
      };

      /*
      |--------------------------------------------------------------------------
      | PostgreSQL transaction
      |--------------------------------------------------------------------------
      */

      let result: {
        status: number;
        response: StoredAttemptResponse;
      };

      try {
        result = await prisma.$transaction(
          async (tx) => {
            /*
            | Verify student belongs to authenticated tenant.
            */

            const student =
              await tx.student.findFirst({
                where: {
                  id: studentId,
                  tenantId,
                },
              });

            if (!student) {
              throw new Error(
                "STUDENT_NOT_FOUND",
              );
            }

            /*
            | Verify evaluator belongs to authenticated tenant.
            */

            const evaluator =
              await tx.user.findFirst({
                where: {
                  id: evaluatorId,
                  tenantId,
                },
              });

            if (!evaluator) {
              throw new Error(
                "EVALUATOR_NOT_FOUND",
              );
            }

            /*
            | Verify competency exists.
            */

            const competency =
              await tx.competency.findUnique({
                where: {
                  id: attemptInput.competencyId,
                },
              });

            if (!competency) {
              throw new Error(
                "COMPETENCY_NOT_FOUND",
              );
            }

            /*
            | Create PostgreSQL attempt.
            */

            const attempt =
              await tx.attempt.create({
                data: {
                  studentId:
                    attemptInput.studentId,

                  competencyId:
                    attemptInput.competencyId,

                  evaluatorId:
                    attemptInput.evaluatorId,

                  score: attemptInput.score,

                  ...(attemptInput.submittedAt
                    ? {
                        submittedAt:
                          attemptInput.submittedAt,
                      }
                    : {}),
                },

                include: {
                  competency: true,
                },
              });

            /*
            | Convert Date objects to JSON-safe strings.
            */

            const responseData =
              JSON.parse(
                JSON.stringify(attempt),
              ) as StoredAttemptResponse["data"];

            /*
            | Store event ID and request ID
            | alongside idempotent response.
            */

            const storedResponse: StoredAttemptResponse =
              {
                data: responseData,
                eventId,
                requestId,
              };

            /*
            | Attempt + idempotency record committed atomically.
            */

            await tx.idempotencyRecord.create({
              data: {
                tenantId,
                key: idempotencyKey,
                requestFingerprint,
                responseStatus: 201,

                responseJson:
                  storedResponse as unknown as Prisma.InputJsonValue,

                expiresAt: new Date(
                  Date.now() +
                    24 * 60 * 60 * 1000,
                ),
              },
            });

            return {
              status: 201,
              response: storedResponse,
            };
          },
        );
      } catch (error) {
        /*
        |--------------------------------------------------------------------------
        | Concurrent idempotency race
        |--------------------------------------------------------------------------
        */

        if (
          error instanceof
            Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const existing =
            await prisma.idempotencyRecord.findUnique({
              where: {
                tenantId_key: {
                  tenantId,
                  key: idempotencyKey,
                },
              },
            });

          if (existing === null) {
            throw error;
          }

          if (
            existing.requestFingerprint !==
            requestFingerprint
          ) {
            throw new AppError(
              409,
              "IDEMPOTENCY_KEY_REUSED",
              "Idempotency key was already used with a different request",
            );
          }

          const stored =
            existing.responseJson as unknown as StoredAttemptResponse;

          try {
            await appendOperationalEvent({
              eventId: stored.eventId,
              eventType: "attempt.succeeded",
              tenantId,
              studentId,
              attemptId: stored.data.id,
              requestId: stored.requestId,
              occurredAt: new Date(),
              metadata: {
                competencyId:
                  parsed.data.competencyId,
                score: parsed.data.score,
                replayed: true,
              },
            });
          } catch (eventError) {
            console.error(
              "Failed to replay concurrent attempt.succeeded event",
              eventError,
            );

            throw new AppError(
              503,
              "OPERATIONAL_EVENT_UNAVAILABLE",
              "Attempt already exists, but its operational event could not be recorded. Retry the same request.",
            );
          }

          res
            .status(existing.responseStatus)
            .json({
              data: stored.data,
            });

          return;
        }

        throw error;
      }

      /*
      |--------------------------------------------------------------------------
      | MongoDB operational event
      |--------------------------------------------------------------------------
      |
      | PostgreSQL has committed successfully.
      |
      | MongoDB is operational/audit storage, not
      | the source of truth.
      |--------------------------------------------------------------------------
      */

      try {
        await appendOperationalEvent({
          eventId,

          eventType: "attempt.succeeded",

          tenantId,

          studentId,

          attemptId:
            result.response.data.id,

          requestId,

          occurredAt: new Date(),

          metadata: {
            competencyId:
              parsed.data.competencyId,

            score: parsed.data.score,
          },
        });
      } catch (eventError) {
        /*
        | PostgreSQL has already committed.
        |
        | Do NOT pretend MongoDB succeeded.
        |
        | Retry with same Idempotency-Key.
        */

        console.error(
          "Failed to append attempt.succeeded event",
          eventError,
        );

        throw new AppError(
          503,
          "OPERATIONAL_EVENT_UNAVAILABLE",
          "Attempt was saved, but the operational event could not be recorded. Retry the same request with the same Idempotency-Key.",
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Everything succeeded
      |--------------------------------------------------------------------------
      */

      res.status(result.status).json({
        data: result.response.data,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "STUDENT_NOT_FOUND") {
          next(
            new AppError(
              404,
              "STUDENT_NOT_FOUND",
              "Student not found",
            ),
          );
          return;
        }

        if (error.message === "EVALUATOR_NOT_FOUND") {
          next(
            new AppError(
              403,
              "EVALUATOR_NOT_AUTHORIZED",
              "Evaluator is not authorized for this tenant",
            ),
          );
          return;
        }

        if (error.message === "COMPETENCY_NOT_FOUND") {
          next(
            new AppError(
              400,
              "COMPETENCY_NOT_FOUND",
              "Competency not found",
            ),
          );
          return;
        }
      }

      next(error);
    }
  },
);

/*
|--------------------------------------------------------------------------
| GET /api/students/:id/activity
|--------------------------------------------------------------------------
|
| MongoDB contains append-only operational events.
|
| PostgreSQL is still used first to verify that the
| requested student belongs to the authenticated tenant.
|--------------------------------------------------------------------------
*/

router.get(
  "/:id/activity",
  authenticate,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const studentId = req.params.id;

      if (typeof studentId !== "string") {
        throw new AppError(
          400,
          "INVALID_STUDENT_ID",
          "Invalid student ID",
        );
      }

      const page = Math.max(
        Number.parseInt(
          String(req.query.page ?? "1"),
          10,
        ) || 1,
        1,
      );

      const limit = Math.min(
        Math.max(
          Number.parseInt(
            String(req.query.limit ?? "20"),
            10,
          ) || 20,
          1,
        ),
        100,
      );

      const tenantId = req.user!.tenantId;

      /*
      |--------------------------------------------------------------------------
      | Tenant authorization
      |--------------------------------------------------------------------------
      */

      const student =
        await prisma.student.findFirst({
          where: {
            id: studentId,
            tenantId,
          },

          select: {
            id: true,
          },
        });

      if (!student) {
        throw new AppError(
          404,
          "STUDENT_NOT_FOUND",
          "Student not found",
        );
      }

      const skip = (page - 1) * limit;

      /*
      |--------------------------------------------------------------------------
      | MongoDB query
      |--------------------------------------------------------------------------
      |
      | tenantId comes from JWT.
      | studentId comes from URL only after PostgreSQL
      | tenant authorization has succeeded.
      |--------------------------------------------------------------------------
      */

      const mongoFilter = {
        tenantId,
        studentId,
      };

      const [events, total] = await Promise.all([
        operationalEvents
          .find(mongoFilter)
          .sort({
            occurredAt: -1,
          })
          .skip(skip)
          .limit(limit)
          .toArray(),

        operationalEvents.countDocuments(
          mongoFilter,
        ),
      ]);

      res.status(200).json({
        success: true,

        data: events,

        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(
            total / limit,
          ),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

/*
|--------------------------------------------------------------------------
| PATCH /api/students/:id
|--------------------------------------------------------------------------
|
| Optimistic concurrency:
|
| Client sends:
|
| {
|   "name": "...",
|   "version": 1
| }
|
| Database only updates if version is still 1.
|--------------------------------------------------------------------------
*/

router.patch(
  "/:id",
  authenticate,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const studentId = req.params.id;

      if (typeof studentId !== "string") {
        throw new AppError(
          400,
          "INVALID_STUDENT_ID",
          "Invalid student ID",
        );
      }

      const parsed =
        updateStudentSchema.safeParse(
          req.body,
        );

      if (!parsed.success) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Invalid student update request",
          parsed.error.flatten(),
        );
      }

      if (
        req.user!.role !== "ADMIN" &&
        req.user!.role !== "EVALUATOR"
      ) {
        throw new AppError(
          403,
          "FORBIDDEN",
          "You are not allowed to update students",
        );
      }

      const student = await updateStudent({
        tenantId: req.user!.tenantId,
        studentId,
        expectedVersion:
          parsed.data.version,

        ...(parsed.data.name !== undefined
          ? {
              name: parsed.data.name,
            }
          : {}),

        ...(parsed.data.email !== undefined
          ? {
              email: parsed.data.email,
            }
          : {}),
      });

      res.status(200).json({
        data: student,
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "STUDENT_NOT_FOUND") {
          next(
            new AppError(
              404,
              "STUDENT_NOT_FOUND",
              "Student not found",
            ),
          );
          return;
        }

        if (error.message === "VERSION_CONFLICT") {
          next(
            new AppError(
              409,
              "VERSION_CONFLICT",
              "Student was modified by another request. Refresh and try again.",
            ),
          );
          return;
        }
      }

      next(error);
    }
  },
);

/*
|--------------------------------------------------------------------------
| GET /api/students/:id
|--------------------------------------------------------------------------
*/

router.get(
  "/:id",
  authenticate,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const tenantId = req.user!.tenantId;
      

      const studentId = req.params.id;

      if (typeof studentId !== "string") {
        throw new AppError(
          400,
          "INVALID_STUDENT_ID",
          "Invalid student ID",
        );
      }

      /*
      |--------------------------------------------------------------------------
      | Tenant ID comes from authenticated JWT.
      | It is NOT accepted from the client.
      |--------------------------------------------------------------------------
      */

      const student =
        await prisma.student.findFirst({
          where: {
            id: studentId,
            tenantId,
          },
        });

      if (!student) {
        throw new AppError(
          404,
          "STUDENT_NOT_FOUND",
          "Student not found",
        );
      }

      const readiness =
        await calculateStudentReadiness(
          student.id,
          tenantId,
        );

      res.status(200).json({
        data: {
          ...student,
          readiness,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

export default router;