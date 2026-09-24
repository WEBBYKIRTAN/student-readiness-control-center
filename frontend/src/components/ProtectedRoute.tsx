import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";

import type { RootState } from "../store";

export default function ProtectedRoute() {
  const location = useLocation();

  const auth = useSelector(
    (state: RootState) => state.auth
  );

  /*
   * Redux is the primary source.
   *
   * localStorage is used as a fallback so a browser refresh
   * or direct URL navigation does not accidentally send an
   * authenticated user back to the login page.
   */
  const storedToken = localStorage.getItem("accessToken");
  const storedUser = localStorage.getItem("authUser");

  const isAuthenticated =
    auth.isAuthenticated ||
    Boolean(storedToken && storedUser);

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/login"
        replace
        state={{
          from: location,
        }}
      />
    );
  }

  return <Outlet />;
}