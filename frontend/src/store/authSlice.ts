import {
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type UserRole =
  | "ADMIN"
  | "EVALUATOR"
  | "VIEWER";

export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
}

interface AuthState {
  accessToken: string | null;
  user: User | null;
  isAuthenticated: boolean;
}

/* -------------------------------------------------------------------------- */
/* Local Storage Helpers                                                      */
/* -------------------------------------------------------------------------- */

function getStoredUser(): User | null {
  const stored = localStorage.getItem("authUser");

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as User;
  } catch {
    localStorage.removeItem("authUser");
    return null;
  }
}

function getStoredToken(): string | null {
  return localStorage.getItem("accessToken");
}

/* -------------------------------------------------------------------------- */
/* Initial State                                                              */
/* -------------------------------------------------------------------------- */

const storedToken = getStoredToken();
const storedUser = getStoredUser();

const initialState: AuthState = {
  accessToken: storedToken,
  user: storedUser,
  isAuthenticated: Boolean(
    storedToken && storedUser
  ),
};

/* -------------------------------------------------------------------------- */
/* Slice                                                                      */
/* -------------------------------------------------------------------------- */

const authSlice = createSlice({
  name: "auth",

  initialState,

  reducers: {
    loginSuccess: (
      state,
      action: PayloadAction<{
        accessToken: string;
        user: User;
      }>
    ) => {
      const { accessToken, user } = action.payload;

      state.accessToken = accessToken;
      state.user = user;
      state.isAuthenticated = true;

      localStorage.setItem(
        "accessToken",
        accessToken
      );

      localStorage.setItem(
        "authUser",
        JSON.stringify(user)
      );
    },

    logout: (state) => {
      state.accessToken = null;
      state.user = null;
      state.isAuthenticated = false;

      localStorage.removeItem("accessToken");
      localStorage.removeItem("authUser");
    },
  },
});

/* -------------------------------------------------------------------------- */
/* Exports                                                                    */
/* -------------------------------------------------------------------------- */

export const {
  loginSuccess,
  logout,
} = authSlice.actions;

export default authSlice.reducer;