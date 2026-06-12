import { Prisma } from "@prisma/client";

// Shared "display a user" projection. Any user RELATION that gets rendered (assignee,
// reviewer, approver, performedBy, comment author, audit actor, …) selects these fields —
// name fields + email are selected only to COMPUTE displayName; the email is never meant to
// reach the client. Pair this select with toUserDisplay() to map the row to { id, displayName }.
export const userDisplaySelect = Prisma.validator<Prisma.UserSelect>()({
  id: true,
  firstName: true,
  lastName: true,
  knownAs: true,
  email: true
});

export type UserDisplayPick = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  knownAs: string | null;
  email: string;
};

export type UserDisplay = { id: string; displayName: string };

// Single source of truth for the person-name convention: knownAs -> "First Last" -> email.
// email is the last-resort fallback for a genuinely nameless user, never the default.
export function computeDisplayName(u: {
  firstName: string | null;
  lastName: string | null;
  knownAs: string | null;
  email: string;
}): string {
  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return u.knownAs?.trim() || fullName || u.email;
}

// Maps a userDisplaySelect row (or null) to the { id, displayName } shape exposed to callers.
export function toUserDisplay(u: UserDisplayPick | null | undefined): UserDisplay | null {
  if (!u) return null;
  return { id: u.id, displayName: computeDisplayName(u) };
}
