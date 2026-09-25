import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import axios from "axios";

import api from "../api/client";

/* -------------------------------------------------------------------------- */
/* Validation Schemas                                                         */
/* -------------------------------------------------------------------------- */

const readinessStatusSchema = z.enum([
  "INCOMPLETE",
  "READY",
  "NEARLY_READY",
  "DEVELOPING",
  "NEEDS_PREPARATION",
]);

const latestAttemptSchema = z.object({
  id: z.string().uuid(),
  score: z.number(),
  submittedAt: z.string(),
  evaluatorId: z.string().uuid(),
  evaluatorName: z.string(),
  evaluatorEmail: z.string(),
});

const competencyReadinessSchema = z.object({
  competencyId: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  weight: z.number(),
  score: z.number().nullable(),
  latestAttempt: latestAttemptSchema.nullable(),
});

const readinessSchema = z.object({
  score: z.number().nullable(),
  status: readinessStatusSchema,
  competencies: z.array(competencyReadinessSchema),
});

const studentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  readiness: readinessSchema,
});

const studentResponseSchema = z.object({
  data: studentSchema,
});

const createAttemptSchema = z.object({
  competencyId: z.string().uuid(),
  score: z.number().min(0).max(100),
});

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type ReadinessStatus = z.infer<
  typeof readinessStatusSchema
>;

type Student = z.infer<typeof studentSchema>;

/* -------------------------------------------------------------------------- */
/* Required Competencies                                                      */
/* -------------------------------------------------------------------------- */


/* -------------------------------------------------------------------------- */
/* Helper Functions                                                           */
/* -------------------------------------------------------------------------- */

function getStatusLabel(
  status: ReadinessStatus
): string {
  switch (status) {
    case "READY":
      return "Ready";

    case "NEARLY_READY":
      return "Nearly Ready";

    case "DEVELOPING":
      return "Developing";

    case "NEEDS_PREPARATION":
      return "Needs Preparation";

    case "INCOMPLETE":
      return "Incomplete";

    default:
      return status;
  }
}

function getStatusClasses(
  status: ReadinessStatus
): string {
  switch (status) {
    case "READY":
      return "border-green-200 bg-green-50 text-green-700";

    case "NEARLY_READY":
      return "border-blue-200 bg-blue-50 text-blue-700";

    case "DEVELOPING":
      return "border-yellow-200 bg-yellow-50 text-yellow-700";

    case "NEEDS_PREPARATION":
      return "border-red-200 bg-red-50 text-red-700";

    case "INCOMPLETE":
      return "border-slate-200 bg-slate-100 text-slate-600";

    default:
      return "border-slate-200 bg-slate-100 text-slate-600";
  }
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(
      (part) =>
        part[0]?.toUpperCase() ?? ""
    )
    .join("");
}

function formatDate(date: string): string {
  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      dateStyle: "medium",
      timeStyle: "short",
    }
  ).format(parsedDate);
}

function getAxiosErrorMessage(
  error: unknown
): string {
  if (!axios.isAxiosError(error)) {
    return "Failed to load student.";
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

  return (
    error.message ||
    "Failed to load student."
  );
}

/* -------------------------------------------------------------------------- */
/* Student Details Page                                                       */
/* -------------------------------------------------------------------------- */

export default function StudentDetailsPage() {
  const navigate = useNavigate();

  const { id } = useParams<{
    id: string;
  }>();

  const [student, setStudent] =
    useState<Student | null>(null);


  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

       const [selectedCompetencyId, setSelectedCompetencyId] =
  useState("");

const [attemptScore, setAttemptScore] =
  useState("");

const [submittingAttempt, setSubmittingAttempt] =
  useState(false);

const [attemptError, setAttemptError] =
  useState<string | null>(null);

const [attemptSuccess, setAttemptSuccess] =
  useState<string | null>(null);

  /* ------------------------------------------------------------------------ */
  /* Load Student                                                             */
  /* ------------------------------------------------------------------------ */

  const loadStudent = useCallback(
    async (isRefresh = false) => {
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
          `/students/${id}`
        );

        console.log(
          "STUDENT DETAILS RESPONSE:",
          JSON.stringify(
            response.data,
            null,
            2
          )
        );

        const parsed =
          studentResponseSchema.safeParse(
            response.data
          );

        if (!parsed.success) {
          console.error(
            "INVALID STUDENT RESPONSE:",
            JSON.stringify(
              parsed.error.format(),
              null,
              2
            )
          );

          setError(
            "The server returned an invalid student response."
          );

          return;
        }

        setStudent(
          parsed.data.data
        );
      } catch (err) {
        console.error(
          "Failed to load student:",
          err
        );

        setError(
          getAxiosErrorMessage(err)
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id]
  );

    /* ------------------------------------------------------------------------ */
  /* Submit Attempt                                                           */
  /* ------------------------------------------------------------------------ */

  const submitAttempt = async () => {
    if (!id) {
      setAttemptError("Invalid student ID.");
      return;
    }

    setAttemptError(null);
    setAttemptSuccess(null);

    const parsed = createAttemptSchema.safeParse({
      competencyId: selectedCompetencyId,
      score: Number(attemptScore),
    });

    if (!parsed.success) {
      setAttemptError(
        "Select a competency and enter a score between 0 and 100.",
      );
      return;
    }

    try {
      setSubmittingAttempt(true);

      /*
       * A fresh idempotency key is generated for every new logical
       * submission. If the same request needs to be retried after
       * a network/event failure, the backend request should reuse
       * the same key. For normal UI submissions, one key represents
       * one logical attempt.
       */
      const idempotencyKey = crypto.randomUUID();

      await api.post(
        `/students/${id}/attempts`,
        {
          competencyId: parsed.data.competencyId,
          score: parsed.data.score,
        },
        {
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
        },
      );

      setAttemptSuccess(
        "Attempt submitted successfully.",
      );

      setSelectedCompetencyId("");
      setAttemptScore("");

      /*
       * Reload the student so the new latest attempt,
       * readiness score and readiness status are immediately
       * reflected in the UI.
       */
      await loadStudent(true);
    } catch (err) {
      console.error(
        "Failed to submit attempt:",
        err,
      );

      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const data = err.response?.data;

        if (
          status === 409 &&
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
        ) {
          setAttemptError(data.error);
        } else if (
          status === 403
        ) {
          setAttemptError(
            "You are not allowed to submit attempts.",
          );
        } else if (
          status === 400
        ) {
          setAttemptError(
            "Invalid attempt. Check the competency and score.",
          );
        } else if (
          status === 503
        ) {
          setAttemptError(
            "The attempt was saved, but the operational event could not be recorded. Retry the same request.",
          );
        } else {
          setAttemptError(
            getAxiosErrorMessage(err),
          );
        }
      } else {
        setAttemptError(
          "Failed to submit attempt.",
        );
      }
    } finally {
      setSubmittingAttempt(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Initial Load                                                             */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const controller =
      new AbortController();

    let active = true;

    const fetchStudent = async () => {
      if (!id) {
        setError("Invalid student ID.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const response = await api.get(
          `/students/${id}`,
          {
            signal:
              controller.signal,
          }
        );

        if (!active) {
          return;
        }

        console.log(
          "STUDENT DETAILS RESPONSE:",
          JSON.stringify(
            response.data,
            null,
            2
          )
        );

        const parsed =
          studentResponseSchema.safeParse(
            response.data
          );

        if (!parsed.success) {
          console.error(
            "INVALID STUDENT RESPONSE:",
            JSON.stringify(
              parsed.error.format(),
              null,
              2
            )
          );

          setError(
            "The server returned an invalid student response."
          );

          return;
        }

        setStudent(
          parsed.data.data
        );
      } catch (err) {
        if (
          controller.signal.aborted ||
          !active
        ) {
          return;
        }

        console.error(
          "Failed to load student:",
          err
        );

        setError(
          getAxiosErrorMessage(err)
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchStudent();

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
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-48 rounded bg-slate-200" />

            <div className="h-32 rounded-xl bg-white" />

            <div className="h-48 rounded-xl bg-white" />

            <div className="h-64 rounded-xl bg-white" />
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* Error State                                                              */
  /* ------------------------------------------------------------------------ */

  if (error && !student) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <h1 className="text-lg font-semibold text-red-700">
              Unable to load student
            </h1>

            <p className="mt-2 text-sm text-red-600">
              {error}
            </p>

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() =>
                  navigate("/students")
                }
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Back to Students
              </button>

              <button
                type="button"
                onClick={() =>
                  loadStudent()
                }
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-600"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!student) {
    return null;
  }

  /* ------------------------------------------------------------------------ */
  /* Main UI                                                                  */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <button
            type="button"
            onClick={() =>
              navigate("/students")
            }
            className="mb-4 text-sm font-medium text-slate-500 transition hover:text-orange-600"
          >
            ← Back to Students
          </button>

          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            {/* Student identity */}
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-orange-100 text-lg font-bold text-orange-600">
                {getInitials(
                  student.name
                )}
              </div>

              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {student.name}
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                  {student.email}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${getStatusClasses(
                  student.readiness
                    .status
                )}`}
              >
                {getStatusLabel(
                  student.readiness
                    .status
                )}
              </span>

              <button
                type="button"
                disabled={refreshing}
                onClick={() =>
                  loadStudent(true)
                }
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshing
                  ? "Refreshing..."
                  : "Refresh"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Main Content                                                       */}
      {/* ------------------------------------------------------------------ */}

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Error while data is visible */}
        {error && student && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-600">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                loadStudent(true)
              }
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Retry
            </button>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Summary Cards                                                    */}
        {/* ---------------------------------------------------------------- */}

        <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* Readiness Score */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">
              Readiness Score
            </p>

            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-bold text-slate-900">
                {student.readiness
                  .score ?? "—"}
              </span>

              {student.readiness
                .score !== null && (
                <span className="text-sm text-slate-400">
                  / 100
                </span>
              )}
            </div>
          </div>

          {/* Readiness Status */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">
              Current Readiness
            </p>

            <div className="mt-3">
              <span
                className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-semibold ${getStatusClasses(
                  student.readiness
                    .status
                )}`}
              >
                {getStatusLabel(
                  student.readiness
                    .status
                )}
              </span>
            </div>
          </div>

          {/* Version */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">
              Student Version
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              v{student.version}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Optimistic concurrency version
            </p>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Student Information                                              */}
        {/* ---------------------------------------------------------------- */}

        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-900">
              Student Information
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Account and tenant information.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Name
              </p>

              <p className="mt-1 text-sm font-medium text-slate-800">
                {student.name}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Email
              </p>

              <p className="mt-1 break-all text-sm font-medium text-slate-800">
                {student.email}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Created
              </p>

              <p className="mt-1 text-sm font-medium text-slate-800">
                {formatDate(
                  student.createdAt
                )}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Updated
              </p>

              <p className="mt-1 text-sm font-medium text-slate-800">
                {formatDate(
                  student.updatedAt
                )}
              </p>
            </div>
          </div>
        </section>

                {/* ---------------------------------------------------------------- */}
        {/* Submit Attempt                                                   */}
        {/* ---------------------------------------------------------------- */}

        <section className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-slate-900">
              Submit Assessment Attempt
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Record a new competency assessment for this student.
            </p>
          </div>

          <div className="px-6 py-6">
            {attemptSuccess && (
              <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
                <p className="text-sm font-medium text-green-700">
                  {attemptSuccess}
                </p>
              </div>
            )}

            {attemptError && (
              <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-700">
                  {attemptError}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_220px_auto] md:items-end">
              {/* Competency */}
              <div>
                <label
                  htmlFor="attempt-competency"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Competency
                </label>

                <select
                  id="attempt-competency"
                  value={selectedCompetencyId}
                  onChange={(event) => {
                    setSelectedCompetencyId(
                      event.target.value,
                    );
                    setAttemptError(null);
                    setAttemptSuccess(null);
                  }}
                  disabled={submittingAttempt}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                  <option value="">
                    Select competency
                  </option>

                  {student.readiness.competencies.map(
                    (competency) => (
                      <option
                        key={competency.competencyId}
                        value={competency.competencyId}
                      >
                        {competency.name} (
                        {Math.round(
                          competency.weight * 100,
                        )}
                        %)
                      </option>
                    ),
                  )}
                </select>
              </div>

              {/* Score */}
              <div>
                <label
                  htmlFor="attempt-score"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Score
                </label>

                <input
                  id="attempt-score"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={attemptScore}
                  onChange={(event) => {
                    setAttemptScore(
                      event.target.value,
                    );
                    setAttemptError(null);
                    setAttemptSuccess(null);
                  }}
                  placeholder="0–100"
                  disabled={submittingAttempt}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100"
                />
              </div>

              {/* Submit */}
              <button
                type="button"
                onClick={submitAttempt}
                disabled={
                  submittingAttempt ||
                  !selectedCompetencyId ||
                  attemptScore === ""
                }
                className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submittingAttempt
                  ? "Submitting..."
                  : "Submit Attempt"}
              </button>
            </div>

            <p className="mt-4 text-xs text-slate-400">
              A new attempt is stored as a separate assessment
              record. The readiness calculation uses the latest
              non-voided attempt for each competency.
            </p>
          </div>
        </section>

     {/* ---------------------------------------------------------------- */}
{/* Competency Evidence                                              */}
{/* ---------------------------------------------------------------- */}
{/* ---------------------------------------------------------------- */}
{/* Competency Evidence                                              */}
{/* ---------------------------------------------------------------- */}

<section className="rounded-xl border border-slate-200 bg-white shadow-sm">
  <div className="border-b border-slate-200 px-6 py-5">
    <h2 className="text-lg font-semibold text-slate-900">
      Competency Evidence
    </h2>

    <p className="mt-1 text-sm text-slate-500">
      Latest non-voided attempt for each competency used in the
      readiness calculation.
    </p>
  </div>

  <div className="divide-y divide-slate-100">
    {student.readiness.competencies.length === 0 ? (
      <div className="px-6 py-8 text-center">
        <p className="text-sm text-slate-500">
          No competencies are configured.
        </p>
      </div>
    ) : (
      student.readiness.competencies.map(
        (competency) => {
          const attempt =
            competency.latestAttempt;

          return (
            <div
              key={competency.competencyId}
              className="px-6 py-5"
            >
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                {/* Competency */}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-900">
                      {competency.name}
                    </h3>

                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
                      {Math.round(
                        competency.weight * 100
                      )}
                      % weight
                    </span>
                  </div>

                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                    {competency.key}
                  </p>
                </div>

                {/* Score */}
                <div className="shrink-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Score
                  </p>

                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {competency.score !== null
                      ? `${competency.score}/100`
                      : "—"}
                  </p>
                </div>

                {/* Latest Attempt */}
                <div className="min-w-0 lg:w-[360px]">
                  {attempt ? (
                    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-wide text-green-700">
                          Latest Attempt
                        </span>

                        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                          Recorded
                        </span>
                      </div>

                      <div className="mt-3 space-y-2">
                        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
                          <span className="text-xs text-slate-500">
                            Attempt ID
                          </span>

                          <span className="break-all font-mono text-xs text-slate-700">
                            {attempt.id}
                          </span>
                        </div>

                        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
                          <span className="text-xs text-slate-500">
                            Evaluator
                          </span>

                          <span className="text-xs font-medium text-slate-700">
                            {attempt.evaluatorName}
                          </span>
                        </div>

                        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
                          <span className="text-xs text-slate-500">
                            Submitted
                          </span>

                          <span className="text-xs font-medium text-slate-700">
                            {formatDate(
                              attempt.submittedAt
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        No Attempt
                      </span>

                      <p className="mt-1 text-sm text-slate-500">
                        No valid attempt has been submitted
                        for this competency.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        }
      )
    )}
  </div>
</section>


        {/* ---------------------------------------------------------------- */}
        {/* Activity                                                          */}
        {/* ---------------------------------------------------------------- */}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() =>
              navigate(
                `/students/${student.id}/activity`
              )
            }
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            View Activity →
          </button>
        </div>
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom-left video element                                          */}
      {/* ------------------------------------------------------------------ */}

      <div className="fixed bottom-1 left-1 z-50">
        <div className="flex items-center gap-1 border border-slate-400 bg-slate-100 px-1 py-0.5 shadow-md">
          <button
            type="button"
            className="flex items-center gap-1 bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-300"
          >
            <span className="text-green-600">
              ▶
            </span>

            Download video from this page
          </button>

          <button
            type="button"
            aria-label="Help"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-300"
          >
            ?
          </button>

          <button
            type="button"
            aria-label="Close"
            className="flex h-5 w-5 items-center justify-center rounded bg-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-300"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}