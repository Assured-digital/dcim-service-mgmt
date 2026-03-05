import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";
import { clearToken, getToken, setToken } from "./auth";

const baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export type ApiError = {
  statusCode: number;
  message: string | string[];
  error?: string;
  path?: string;
  timestamp?: string;
};

export type LoginResponse = {
  accessToken: string;
  refreshToken?: string;
  user: {
    userId: string;
    email: string;
    role: string;
    clientId: string | null;
  };
};

export const api = axios.create({
  baseURL,
  withCredentials: true
});

export function setAuthToken(token: string | null) {
  if (token) api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  else delete api.defaults.headers.common["Authorization"];
}

export function getAuthToken(): string | null {
  return getToken();
}

export function logout() {
  clearToken();
  setAuthToken(null);
}

type RetryableConfig = AxiosRequestConfig & {
  _retry?: boolean;
  skipAuthRefresh?: boolean;
};

let refreshInFlight: Promise<string | null> | null = null;

async function tryRefreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const res = await axios.post<{ accessToken: string }>(
        `${baseURL}/auth/refresh`,
        {},
        { withCredentials: true }
      );

      const token = res.data?.accessToken;
      if (!token) return null;

      setToken(token);
      setAuthToken(token);
      return token;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function revokeAndLogout() {
  try {
    const config: RetryableConfig = { skipAuthRefresh: true };
    await api.post("/auth/logout", {}, config);
  } catch {
    // Local logout should still happen if revoke call fails.
  } finally {
    logout();
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }
}

function normaliseApiError(err: unknown): ApiError {
  const fallback: ApiError = { statusCode: 0, message: "Request failed" };

  if (!axios.isAxiosError(err)) return fallback;

  const ax = err as AxiosError<any>;
  const statusCode = ax.response?.status ?? 0;
  const data = ax.response?.data;

  if (data && typeof data === "object") {
    return {
      statusCode: data.statusCode ?? statusCode,
      message: data.message ?? ax.message,
      error: data.error,
      path: data.path,
      timestamp: data.timestamp
    };
  }

  return { statusCode, message: ax.message };
}

// Response interceptor: handle auth + return consistent errors
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const e = normaliseApiError(err);
    const original = (err?.config ?? {}) as InternalAxiosRequestConfig & RetryableConfig;
    const url = original.url ?? "";

    const isAuthRoute =
      url.includes("/auth/login") || url.includes("/auth/refresh") || url.includes("/auth/logout");

    // Attempt one silent refresh for expired access token and then retry original request.
    if (e.statusCode === 401 && !original._retry && !original.skipAuthRefresh && !isAuthRoute) {
      original._retry = true;
      const token = await tryRefreshAccessToken();

      if (token) {
        original.headers = {
          ...(original.headers ?? {}),
          Authorization: `Bearer ${token}`
        };
        return api.request(original);
      }
    }

    if (e.statusCode === 401) {
      logout();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(e);
  }
);

// On load: initialise token header if present
setAuthToken(getAuthToken());
