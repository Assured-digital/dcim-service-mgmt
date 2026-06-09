const TOKEN_KEY = "dcms_access_token";
const USER_KEY = "dcms_user";

export type CurrentUser = {
  userId: string;
  email: string;
  role: string;
  organizationId: string | null;
};

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function setCurrentUser(user: CurrentUser | null) {
  if (!user) {
    localStorage.removeItem(USER_KEY);
    return;
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getCurrentUser(): CurrentUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return inferUserFromToken(getToken());

  try {
    const parsed = JSON.parse(raw) as Partial<CurrentUser>;
    if (!parsed.userId || !parsed.role) return inferUserFromToken(getToken());
    return {
      userId: parsed.userId,
      email: parsed.email ?? "",
      role: parsed.role,
      organizationId: parsed.organizationId ?? null
    };
  } catch {
    return inferUserFromToken(getToken());
  }
}

export function setSession(token: string, user?: CurrentUser) {
  setToken(token);
  const resolved = user ?? inferUserFromToken(token);
  setCurrentUser(resolved);
}

export function clearSession() {
  clearToken();
  setCurrentUser(null);
}

export function isOrgSuperRole(role: string | null | undefined) {
  return role === "ORG_OWNER" || role === "ORG_ADMIN" || role === "ADMIN";
}

function inferUserFromToken(token: string | null): CurrentUser | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(parts[1])) as Partial<CurrentUser>;
    if (!payload.userId || !payload.role) return null;
    return {
      userId: payload.userId,
      email: payload.email ?? "",
      role: payload.role,
      organizationId: payload.organizationId ?? null
    };
  } catch {
    return null;
  }
}

function base64UrlDecode(v: string) {
  const b64 = v.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return decodeURIComponent(
    atob(padded)
      .split("")
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join("")
  );
}
