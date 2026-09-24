import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import axios from "axios";

/* -------------------------------------------------------------------------- */
/* API                                                                        */
/* -------------------------------------------------------------------------- */

import api from "../api/client";

/* -------------------------------------------------------------------------- */
/* Schemas                                                                    */
/* -------------------------------------------------------------------------- */

const readinessStatusSchema = z.enum([
  "INCOMPLETE",
  "READY",
  "NEARLY_READY",
  "DEVELOPING",
  "NEEDS_PREPARATION",
]);

const studentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  version: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),

  /*
   * INCOMPLETE students may not have a readiness score.
   */
  readinessScore: z.number().nullable(),

  readinessStatus: readinessStatusSchema,
});

const studentsResponseSchema = z.object({
  data: z.array(studentSchema),

  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type ReadinessStatus = z.infer<
  typeof readinessStatusSchema
>;

type Student = z.infer<typeof studentSchema>;

const STATUS_OPTIONS: {
  value: ReadinessStatus;
  label: string;
}[] = [
  {
    value: "READY",
    label: "Ready",
  },
  {
    value: "NEARLY_READY",
    label: "Nearly Ready",
  },
  {
    value: "DEVELOPING",
    label: "Developing",
  },
  {
    value: "NEEDS_PREPARATION",
    label: "Needs Preparation",
  },
  {
    value: "INCOMPLETE",
    label: "Incomplete",
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function getStatusLabel(
  status: ReadinessStatus
) {
  return (
    STATUS_OPTIONS.find(
      (item) => item.value === status
    )?.label ?? status
  );
}

function getStatusClasses(
  status: ReadinessStatus
) {
  switch (status) {
    case "READY":
      return "bg-green-50 text-green-700 border-green-200";

    case "NEARLY_READY":
      return "bg-blue-50 text-blue-700 border-blue-200";

    case "DEVELOPING":
      return "bg-yellow-50 text-yellow-700 border-yellow-200";

    case "NEEDS_PREPARATION":
      return "bg-red-50 text-red-700 border-red-200";

    case "INCOMPLETE":
      return "bg-slate-100 text-slate-600 border-slate-200";

    default:
      return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(
      (part) => part[0]?.toUpperCase() ?? ""
    )
    .join("");
}

function getAxiosErrorMessage(
  error: unknown
): string {
  if (!axios.isAxiosError(error)) {
    return "Failed to load students.";
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
    "Failed to load students."
  );
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function StudentsPage() {
  const navigate = useNavigate();

  const [
    searchParams,
    setSearchParams,
  ] = useSearchParams();

  /* ------------------------------------------------------------------------ */
  /* URL State                                                                */
  /* ------------------------------------------------------------------------ */

  const urlSearch =
    searchParams.get("search") ?? "";

  const urlStatus =
    searchParams.get("status") ?? "";

  const urlPage = Number(
    searchParams.get("page") ?? "1"
  );

  const urlPageSize = Number(
    searchParams.get("pageSize") ?? "20"
  );

  const page =
    Number.isInteger(urlPage) &&
    urlPage >= 1
      ? urlPage
      : 1;

  const pageSize =
    Number.isInteger(urlPageSize) &&
    urlPageSize >= 1 &&
    urlPageSize <= 100
      ? urlPageSize
      : 20;

  const status: ReadinessStatus | "" =
    readinessStatusSchema.safeParse(
      urlStatus
    ).success
      ? (urlStatus as ReadinessStatus)
      : "";

  /* ------------------------------------------------------------------------ */
  /* State                                                                    */
  /* ------------------------------------------------------------------------ */

  const [searchInput, setSearchInput] =
    useState(urlSearch);

  const [students, setStudents] =
    useState<Student[]>([]);

  const [pagination, setPagination] =
    useState({
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  /* ------------------------------------------------------------------------ */
  /* Sync Search With URL                                                     */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    setSearchInput(urlSearch);
  }, [urlSearch]);

  /* ------------------------------------------------------------------------ */
  /* Fetch Students                                                           */
  /* ------------------------------------------------------------------------ */

  useEffect(() => {
    const controller =
      new AbortController();

    let active = true;

    const loadStudents = async () => {
      try {
        setError(null);

        if (students.length === 0) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }

        const params: Record<
          string,
          string | number
        > = {
          page,
          pageSize,
        };

        if (urlSearch.trim()) {
          params.search =
            urlSearch.trim();
        }

        if (status) {
          params.status = status;
        }

        const response =
          await api.get("/students", {
            params,
            signal: controller.signal,
          });

        if (!active) {
          return;
        }

        console.log(
          "STUDENTS API RESPONSE:",
          JSON.stringify(
            response.data,
            null,
            2
          )
        );

        const parsed =
          studentsResponseSchema.safeParse(
            response.data
          );

        if (!parsed.success) {
          console.error(
            "INVALID STUDENTS RESPONSE:",
            JSON.stringify(
              parsed.error.format(),
              null,
              2
            )
          );

          setError(
            "The server returned an invalid students response."
          );

          return;
        }

        setStudents(
          parsed.data.data
        );

        setPagination(
          parsed.data.pagination
        );
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }

        console.error(
          "Failed to load students:",
          err
        );

        if (active) {
          setError(
            getAxiosErrorMessage(err)
          );
        }
      } finally {
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    loadStudents();

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    page,
    pageSize,
    status,
    urlSearch,
  ]);

  /* ------------------------------------------------------------------------ */
  /* URL Update                                                               */
  /* ------------------------------------------------------------------------ */

  const updateQuery = (
    updates: Record<
      string,
      string | number | null
    >
  ) => {
    const next =
      new URLSearchParams(
        searchParams
      );

    Object.entries(updates).forEach(
      ([key, value]) => {
        if (
          value === null ||
          value === "" ||
          value === undefined
        ) {
          next.delete(key);
        } else {
          next.set(
            key,
            String(value)
          );
        }
      }
    );

    setSearchParams(next);
  };

  /* ------------------------------------------------------------------------ */
  /* Search                                                                   */
  /* ------------------------------------------------------------------------ */

  const handleSearchChange = (
    value: string
  ) => {
    setSearchInput(value);

    updateQuery({
      search: value,
      page: 1,
    });
  };

  /* ------------------------------------------------------------------------ */
  /* Status                                                                    */
  /* ------------------------------------------------------------------------ */

  const handleStatusChange = (
    value: string
  ) => {
    updateQuery({
      status: value || null,
      page: 1,
    });
  };

  /* ------------------------------------------------------------------------ */
  /* Page Size                                                                 */
  /* ------------------------------------------------------------------------ */

  const handlePageSizeChange = (
    value: string
  ) => {
    updateQuery({
      pageSize: Number(value),
      page: 1,
    });
  };

  /* ------------------------------------------------------------------------ */
  /* Pagination                                                                */
  /* ------------------------------------------------------------------------ */

  const goToPage = (
    nextPage: number
  ) => {
    if (
      nextPage < 1 ||
      nextPage > pagination.totalPages
    ) {
      return;
    }

    updateQuery({
      page: nextPage,
    });
  };

  /* ------------------------------------------------------------------------ */
  /* Average Score                                                             */
  /* ------------------------------------------------------------------------ */

  const averageScore = useMemo(() => {
    const scoredStudents =
      students.filter(
        (
          student
        ) =>
          student.readinessScore !==
          null
      );

    if (
      scoredStudents.length === 0
    ) {
      return null;
    }

    const total =
      scoredStudents.reduce(
        (sum, student) =>
          sum +
          (student.readinessScore ?? 0),
        0
      );

    return Math.round(
      (total / scoredStudents.length) *
        10
    ) / 10;
  }, [students]);

  /* ------------------------------------------------------------------------ */
  /* Loading                                                                   */
  /* ------------------------------------------------------------------------ */

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="animate-pulse">
            <div className="h-8 w-48 rounded bg-slate-200" />

            <div className="mt-3 h-4 w-72 rounded bg-slate-200" />

            <div className="mt-8 h-20 rounded-xl bg-white" />

            <div className="mt-6 h-96 rounded-xl bg-white" />
          </div>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* UI                                                                       */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Students
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Monitor student readiness and
              competency progress.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              navigate("/dashboard")
            }
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Dashboard
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        {/* Summary */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Total */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Total Students
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {pagination.total}
            </p>
          </div>

          {/* Current Page */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Students on Page
            </p>

            <p className="mt-2 text-3xl font-bold text-slate-900">
              {students.length}
            </p>
          </div>

          {/* Average */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">
              Average Score
            </p>

            <p className="mt-2 text-3xl font-bold text-orange-500">
              {averageScore ?? "—"}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px_120px]">
            {/* Search */}
            <div>
              <label
                htmlFor="student-search"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Search students
              </label>

              <div className="relative">
                <input
                  id="student-search"
                  type="search"
                  value={searchInput}
                  onChange={(event) =>
                    handleSearchChange(
                      event.target.value
                    )
                  }
                  placeholder="Search by name or email..."
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                />

                {searchInput && (
                  <button
                    type="button"
                    onClick={() =>
                      handleSearchChange("")
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    aria-label="Clear search"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Status */}
            <div>
              <label
                htmlFor="status-filter"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Readiness
              </label>

              <select
                id="status-filter"
                value={status}
                onChange={(event) =>
                  handleStatusChange(
                    event.target.value
                  )
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
              >
                <option value="">
                  All statuses
                </option>

                {STATUS_OPTIONS.map(
                  (option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  )
                )}
              </select>
            </div>

            {/* Page Size */}
            <div>
              <label
                htmlFor="page-size"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Per page
              </label>

              <select
                id="page-size"
                value={pageSize}
                onChange={(event) =>
                  handlePageSizeChange(
                    event.target.value
                  )
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
              >
                <option value="10">
                  10
                </option>

                <option value="20">
                  20
                </option>

                <option value="50">
                  50
                </option>

                <option value="100">
                  100
                </option>
              </select>
            </div>
          </div>

          {refreshing && (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
              Refreshing students...
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-600">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                window.location.reload()
              }
              className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty */}
        {!error &&
          students.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                <span className="text-2xl">
                  👥
                </span>
              </div>

              <h2 className="mt-4 text-lg font-semibold text-slate-900">
                No students found
              </h2>

              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
                Try changing your search or
                readiness filter.
              </p>

              {(urlSearch || status) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchParams({
                      page: "1",
                      pageSize:
                        String(pageSize),
                    });
                  }}
                  className="mt-5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

        {/* Table */}
        {students.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Student
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Score
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Readiness
                    </th>

                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Version
                    </th>

                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {students.map(
                    (student) => (
                      <tr
                        key={student.id}
                        className="transition hover:bg-slate-50"
                      >
                        {/* Student */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-semibold text-orange-600">
                              {getInitials(
                                student.name
                              )}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">
                                {student.name}
                              </p>

                              <p className="truncate text-sm text-slate-500">
                                {student.email}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Score */}
                        <td className="px-6 py-4">
                          {student.readinessScore ===
                          null ? (
                            <span className="text-sm font-medium text-slate-400">
                              —
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-semibold text-slate-900">
                                {
                                  student.readinessScore
                                }
                              </span>

                              <span className="text-xs text-slate-400">
                                / 100
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${getStatusClasses(
                              student.readinessStatus
                            )}`}
                          >
                            {getStatusLabel(
                              student.readinessStatus
                            )}
                          </span>
                        </td>

                        {/* Version */}
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-600">
                            v{student.version}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                `/students/${student.id}`
                              )
                            }
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Showing{" "}
                <span className="font-medium text-slate-700">
                  {pagination.total ===
                  0
                    ? 0
                    : (page - 1) *
                        pageSize +
                      1}
                </span>{" "}
                to{" "}
                <span className="font-medium text-slate-700">
                  {Math.min(
                    page * pageSize,
                    pagination.total
                  )}
                </span>{" "}
                of{" "}
                <span className="font-medium text-slate-700">
                  {pagination.total}
                </span>{" "}
                students
              </p>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() =>
                    goToPage(page - 1)
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>

                <span className="px-2 text-sm text-slate-500">
                  Page {page} of{" "}
                  {Math.max(
                    pagination.totalPages,
                    1
                  )}
                </span>

                <button
                  type="button"
                  disabled={
                    page >=
                    pagination.totalPages
                  }
                  onClick={() =>
                    goToPage(page + 1)
                  }
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}