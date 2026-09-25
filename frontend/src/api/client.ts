import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from "axios";

const api = axios.create({
  baseURL:
    import.meta.env.VITE_API_URL ??
    "http://localhost:3000/api",

  headers: {
    "Content-Type": "application/json",
  },
});

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

let refreshPromise: Promise<string | null> | null = null;

/*
 * Add the current access token to every request.
 */
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/*
 * Refresh the access token when the backend returns 401.
 */
api.interceptors.response.use(
  (response) => response,

  async (error: AxiosError) => {
    const originalRequest =
      error.config as RetryableRequestConfig | undefined;

    /*
     * No request config or not a 401.
     */
    if (
      !originalRequest ||
      error.response?.status !== 401
    ) {
      return Promise.reject(error);
    }

    /*
     * Never retry the same request more than once.
     */
    if (originalRequest._retry) {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("authUser");

      window.location.href = "/login";

      return Promise.reject(error);
    }

    /*
     * Don't try to refresh the refresh endpoint itself.
     */
    if (
      originalRequest.url?.includes("/auth/refresh")
    ) {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("authUser");

      window.location.href = "/login";

      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      /*
       * If several API requests receive 401 at nearly the
       * same time, they all share the same refresh request.
       */
      if (!refreshPromise) {
        refreshPromise = axios
          .post(
            `${import.meta.env.VITE_API_URL ?? "http://localhost:3000/api"}/auth/refresh`,
            {},
            {
              withCredentials: true,
              headers: {
                "Content-Type": "application/json",
              },
            },
          )
          .then((response) => {
            const newAccessToken =
              response.data?.data?.accessToken;

            if (
              typeof newAccessToken !== "string"
            ) {
              throw new Error(
                "Refresh response did not contain an access token.",
              );
            }

            localStorage.setItem(
              "accessToken",
              newAccessToken,
            );

            return newAccessToken;
          })
          .catch(() => {
            localStorage.removeItem("accessToken");
            localStorage.removeItem("authUser");

            return null;
          })
          .finally(() => {
            refreshPromise = null;
          });
      }

      const newAccessToken =
        await refreshPromise;

      if (!newAccessToken) {
        window.location.href = "/login";

        return Promise.reject(error);
      }

      /*
       * Retry the original request using the new token.
       */
      originalRequest.headers.Authorization =
        `Bearer ${newAccessToken}`;

      return api(originalRequest);
    } catch {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("authUser");

      window.location.href = "/login";

      return Promise.reject(error);
    }
  },
);

export default api;