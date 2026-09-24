import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

import type { RootState, AppDispatch } from "../store";
import { logout } from "../store/authSlice";

export default function DashboardPage() {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();

  const user = useSelector((state: RootState) => state.auth.user);

  const handleLogout = () => {
    dispatch(logout());
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">
              Student Readiness Control Center
            </h1>

            <p className="text-sm text-slate-500">
              {user?.name} · {user?.role}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-xl bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-semibold text-slate-900">
            Dashboard
          </h2>

          <p className="mt-2 text-slate-500">
            Authentication is working. Student data will be connected next.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Tenant</p>
              <p className="mt-1 break-all font-medium">
                {user?.tenantId}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Email</p>
              <p className="mt-1 font-medium">{user?.email}</p>
            </div>

            <div className="rounded-lg bg-slate-50 p-5">
              <p className="text-sm text-slate-500">Role</p>
              <p className="mt-1 font-medium">{user?.role}</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}