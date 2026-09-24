import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import axios from "axios";

import api from "../api/client";

/* -------------------------------------------------------------------------- */
/* Validation Schemas                                                         */
/* -------------------------------------------------------------------------- */

const eventTypeSchema = z.enum([
  "attempt.succeeded",
  "attempt.rejected",
]);

const activityEventSchema = z.object({
  _id: z.string().optional(),
  eventId: z.string().uuid(),
  eventType: eventTypeSchema,
  tenantId: z.string().uuid(),
  studentId: z.string().uuid(),
  attemptId: z.string().uuid().optional(),
  requestId: z.string().uuid(),
  occurredAt: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

const activityResponseSchema = z.object({
  success: z.boolean(),
  data: z.array(activityEventSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type ActivityEvent = z.infer<typeof activityEventSchema>;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatDate(date: string): string {
  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedDate);
}

function getEventTitle(eventType: ActivityEvent["eventType"]): string {
  switch (eventType) {
    case "attempt.succeeded":
      return "Attempt Succeeded";

    case "attempt.rejected":
      return "Attempt Rejected";

    default:
      return "Activity";
  }
}

function getEventClasses(
  eventType: ActivityEvent["eventType"],
): string {
  switch (eventType) {
    case "attempt.succeeded":
      return "border-green-200 bg-green-50 text-green-700";

    case "attempt.rejected":
      return "border-red-200 bg-red-50 text-red-700";

    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

function getAxiosErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return "Failed to load activity.";
  }

  const data = error.response?.data;

  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return error.message || "Failed to load activity.";
}

/* -------------------------------------------------------------------------- */
/* Activity Page                                                              */
/* -------------------------------------------------------------------------- */

export default function ActivityPage() {
  const navigate = useNavigate();

  const { id } = useParams<{
    id: string;
  }>();

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  /* ------------------------------------------------------------------------ */
  /* Load Activity                                                            */
  /* ------------------------------------------------------------------------ */

  async function loadActivity(
    requestedPage: number,
    isRefresh = false,
  ) {
    if (!id) {
      setError("Invalid student ID.");
      setLoading(false);
      return;
    }

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      const response = await api.get(
        `/students/${id}/activity`,
        {
          params: {
            page: requestedPage,
            limit: 20,
          },
        },
      );

      const parsed =
        activityResponseSchema.safeParse(
          response.data,
        );

      if (!parsed.success) {
        console.error(
          "INVALID ACTIVITY RESPONSE:",
          parsed.error.format(),
        );

        setError(
          "The server returned an invalid activity response.",
        );

        return;
      }

      setEvents(parsed.data.data);
      setPage(parsed.data.pagination.page);
      setTotalPages(parsed.data.pagination.totalPages);
      setTotal(parsed.data.pagination.total);
    } catch (err) {
      console.error(
        "Failed to load activity:",
        err,
      );

      setError(
        getAxiosErrorMessage(err),
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Initial Load                                                             */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    let active = true;

    const controller = new AbortController();

    async function fetchActivity() {
      if (!id) {
        setError("Invalid student ID.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await api.get(
          `/students/${id}/activity`,
          {
            params: {
              page: 1,
              limit: 20,
            },
            signal: controller.signal,
          },
        );

        if (!active) {
          return;
        }

        const parsed =
          activityResponseSchema.safeParse(
            response.data,
          );

        if (!parsed.success) {
          console.error(
            "INVALID ACTIVITY RESPONSE:",
            parsed.error.format(),
          );

          setError(
            "The server returned an invalid activity response.",
          );

          return;
        }

        setEvents(parsed.data.data);
        setPage(parsed.data.pagination.page);
        setTotalPages(
          parsed.data.pagination.totalPages,
        );
        setTotal(parsed.data.pagination.total);
      } catch (err) {
        if (
          controller.signal.aborted ||
          !active
        ) {
          return;
        }

        console.error(
          "Failed to load activity:",
          err,
        );

        setError(
          getAxiosErrorMessage(err),
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchActivity();

    return () => {
      active = false;
      controller.abort();
    };
  }, [id]);

  /* ------------------------------------------------------------------------ */
  /* Loading State                                                            */
  /* ------------------------------------------------------------------------ */

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 rounded bg-slate-200" />
            <div className="h-32 rounded-xl bg-white" />
            <div className="h-64 rounded-xl bg-white" />
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Error State                                                              */
  /* ------------------------------------------------------------------------ */

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <h1 className="text-lg font-semibold text-red-700">
              Unable to load activity
            </h1>

            <p className="mt-2 text-sm text-red-600">
              {error}
            </p>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() =>
                  navigate(
                    `/students/${id}`,
                  )
                }
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                ← Student Details
              </button>

              <button
                type="button"
                onClick={() =>
                  loadActivity(page, true)
                }
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Main UI                                                                  */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <button
            type="button"
            onClick={() =>
              navigate(
                `/students/${id}`,
              )
            }
            className="mb-4 text-sm font-medium text-slate-500 hover:text-orange-600"
          >
            ← Back to Student
          </button>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Activity
              </h1>

              <p className="mt-1 text-sm text-slate-500">
                Operational events recorded for this
                student.
              </p>
            </div>

            <button
              type="button"
              disabled={refreshing}
              onClick={() =>
                loadActivity(page, true)
              }
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {refreshing
                ? "Refreshing..."
                : "Refresh"}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Summary */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">
            Total events
          </p>

          <p className="mt-2 text-3xl font-bold text-slate-900">
            {total}
          </p>
        </section>

        {/* Empty State */}
        {events.length === 0 ? (
          <section className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-xl">
              —
            </div>

            <h2 className="mt-4 text-lg font-semibold text-slate-900">
              No activity yet
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Operational events for this student
              will appear here.
            </p>
          </section>
        ) : (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <h2 className="text-lg font-semibold text-slate-900">
                Event History
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Newest events are shown first.
              </p>
            </div>

            <div className="divide-y divide-slate-100">
              {events.map((event) => {
                const competencyId =
                  typeof event.metadata
                    .competencyId === "string"
                    ? event.metadata.competencyId
                    : null;

                const score =
                  typeof event.metadata.score ===
                  "number"
                    ? event.metadata.score
                    : null;

                return (
                  <article
                    key={event.eventId}
                    className="px-6 py-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold text-slate-900">
                            {getEventTitle(
                              event.eventType,
                            )}
                          </h3>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getEventClasses(
                              event.eventType,
                            )}`}
                          >
                            {event.eventType}
                          </span>
                        </div>

                        <p className="mt-2 text-sm text-slate-500">
                          {formatDate(
                            event.occurredAt,
                          )}
                        </p>
                      </div>

                      {score !== null && (
                        <div className="shrink-0 rounded-lg bg-slate-50 px-4 py-3 text-right">
                          <p className="text-xs text-slate-500">
                            Score
                          </p>

                          <p className="text-xl font-bold text-slate-900">
                            {score}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          Attempt ID
                        </p>

                        <p className="mt-1 break-all font-mono text-xs text-slate-700">
                          {event.attemptId ??
                            "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                          Request ID
                        </p>

                        <p className="mt-1 break-all font-mono text-xs text-slate-700">
                          {event.requestId}
                        </p>
                      </div>

                      {competencyId && (
                        <div className="sm:col-span-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            Competency ID
                          </p>

                          <p className="mt-1 break-all font-mono text-xs text-slate-700">
                            {competencyId}
                          </p>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() =>
                loadActivity(page - 1)
              }
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Previous
            </button>

            <span className="text-sm text-slate-500">
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() =>
                loadActivity(page + 1)
              }
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}