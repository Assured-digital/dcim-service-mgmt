import axios, { AxiosError } from "axios";
import { clearToken, getToken } from "./auth";

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
  refreshToken: string;
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
  (err) => {
    const e = normaliseApiError(err);

    // Global 401 handling: clear token so app doesn’t get stuck
    if (e.statusCode === 401) {
      logout();
      // Optional: force redirect to login. Keep it simple for MVP.
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(e);
  }
);

// On load: initialise token header if present
setAuthToken(getAuthToken());
