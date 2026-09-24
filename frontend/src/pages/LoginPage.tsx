import { useState, type FormEvent } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import axios from "axios";

import api from "../api/client";
import { loginSuccess } from "../store/authSlice";
import type { AppDispatch } from "../store";

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const loginSchema = z.object({
  tenantId: z.string().uuid("Enter a valid tenant ID"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const loginResponseSchema = z.object({
  data: z.object({
    accessToken: z.string().min(1),
    user: z.object({
      id: z.string(),
      tenantId: z.string(),
      email: z.string(),
      name: z.string(),
      role: z.enum(["ADMIN", "EVALUATOR", "VIEWER"]),
    }),
  }),
});

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

type LoginForm = {
  tenantId: string;
  email: string;
  password: string;
};

/* -------------------------------------------------------------------------- */
/* Axios Error                                                                */
/* -------------------------------------------------------------------------- */

function axiosErrorMessage(error: unknown): string | null {
  if (!axios.isAxiosError(error)) {
    return null;
  }

  const data = error.response?.data;

  if (typeof data === "object" && data !== null) {
    const serverData = data as {
      error?: unknown;
      message?: unknown;
    };

    if (typeof serverData.error === "string") {
      return serverData.error;
    }

    if (typeof serverData.message === "string") {
      return serverData.message;
    }
  }

  if (typeof data === "string" && data.trim()) {
    return data;
  }

  return error.message || null;
}

/* -------------------------------------------------------------------------- */
/* Login Page                                                                 */
/* -------------------------------------------------------------------------- */

export default function LoginPage() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const [form, setForm] = useState<LoginForm>({
    tenantId: "",
    email: "",
    password: "",
  });

  const [error, setError] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<keyof LoginForm, string>>
  >({});

  const [loading, setLoading] = useState(false);

  /* ------------------------------------------------------------------------ */
  /* Change Handler                                                           */
  /* ------------------------------------------------------------------------ */

  const handleChange = (field: keyof LoginForm, value: string) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));

    setFieldErrors((previous) => ({
      ...previous,
      [field]: undefined,
    }));

    setError(null);
  };

  /* ------------------------------------------------------------------------ */
  /* Submit                                                                   */
  /* ------------------------------------------------------------------------ */

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError(null);
    setFieldErrors({});

    const validation = loginSchema.safeParse({
      tenantId: form.tenantId.trim(),
      email: form.email.trim(),
      password: form.password,
    });

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;

      setFieldErrors({
        tenantId: errors.tenantId?.[0],
        email: errors.email?.[0],
        password: errors.password?.[0],
      });

      return;
    }

    try {
      setLoading(true);

      const response = await api.post(
        "/auth/login",
        validation.data
      );

      const parsed = loginResponseSchema.safeParse(response.data);

      if (!parsed.success) {
        console.error(
          "Invalid login response:",
          parsed.error.format()
        );

        setError("The server returned an invalid response.");
        return;
      }

      dispatch(
        loginSuccess({
          accessToken: parsed.data.data.accessToken,
          user: parsed.data.data.user,
        })
      );

      navigate("/dashboard", {
        replace: true,
      });
    } catch (err) {
      console.error("Login error:", err);

      const message = axiosErrorMessage(err);

      setError(
        message ?? "Login failed. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------------------ */
  /* UI                                                                       */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50">
      {/* ------------------------------------------------------------------ */}
      {/* Background Decoration                                               */}
      {/* ------------------------------------------------------------------ */}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-orange-200/40 blur-3xl" />

        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-orange-100/60 blur-3xl" />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Main Login Container                                                */}
      {/* ------------------------------------------------------------------ */}

      <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Logo / Brand */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 shadow-lg shadow-orange-500/20">
              <span className="text-2xl font-bold text-white">
                SR
              </span>
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Student Readiness
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              Control Center
            </p>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Login Card                                                        */}
          {/* ---------------------------------------------------------------- */}

          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
            {/* Error */}
            {error && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Tenant ID */}
              <div>
                <label
                  htmlFor="tenantId"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Tenant ID
                </label>

                <input
                  id="tenantId"
                  type="text"
                  value={form.tenantId}
                  onChange={(event) =>
                    handleChange("tenantId", event.target.value)
                  }
                  placeholder="Enter tenant ID"
                  autoComplete="organization"
                  disabled={loading}
                  className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                    fieldErrors.tenantId
                      ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                      : "border-slate-300 focus:border-orange-500 focus:ring-orange-100"
                  }`}
                />

                {fieldErrors.tenantId && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {fieldErrors.tenantId}
                  </p>
                )}
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Email
                </label>

                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    handleChange("email", event.target.value)
                  }
                  placeholder="admin@tenant-a.com"
                  autoComplete="email"
                  disabled={loading}
                  className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                    fieldErrors.email
                      ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                      : "border-slate-300 focus:border-orange-500 focus:ring-orange-100"
                  }`}
                />

                {fieldErrors.email && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
                  Password
                </label>

                <input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(event) =>
                    handleChange("password", event.target.value)
                  }
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={loading}
                  className={`w-full rounded-xl border bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-4 ${
                    fieldErrors.password
                      ? "border-red-400 focus:border-red-500 focus:ring-red-100"
                      : "border-slate-300 focus:border-orange-500 focus:ring-orange-100"
                  }`}
                />

                {fieldErrors.password && (
                  <p className="mt-1.5 text-xs text-red-500">
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 transition hover:bg-orange-600 focus:outline-none focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            {/* Demo Credentials */}
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Demo Account
              </p>

              <div className="space-y-1 text-xs text-slate-500">
                <p>
                  <span className="font-medium text-slate-700">
                    Tenant:
                  </span>{" "}
                  550e8400-e29b-41d4-a716-446655440000
                </p>

                <p>
                  <span className="font-medium text-slate-700">
                    Email:
                  </span>{" "}
                  admin@tenant-a.com
                </p>

                <p>
                  <span className="font-medium text-slate-700">
                    Password:
                  </span>{" "}
                  Password@123
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-slate-400">
            Student Readiness Control Center
          </p>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom-Left Element From Your Screenshot                           */}
      {/* ------------------------------------------------------------------ */}

      <div className="fixed bottom-3 left-3 z-50">
        <div className="flex items-center gap-1 rounded-sm border border-slate-400 bg-slate-100 px-2 py-1 shadow-md">
          <button
            type="button"
            className="flex items-center gap-1 rounded border border-slate-400 bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-300"
          >
            <span className="text-green-600">▶</span>
            Download video from this page
          </button>

          <button
            type="button"
            aria-label="Help"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-400"
          >
            ?
          </button>

          <button
            type="button"
            aria-label="Close"
            className="flex h-5 w-5 items-center justify-center rounded bg-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-400"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}