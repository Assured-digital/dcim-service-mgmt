// Shared field-level diff for audit history. Given the OLD record, the update DTO, and a
// per-service field-spec, returns the humanised changes (field, label, from, to). Pure +
// synchronous — humanisation values are passed in, never fetched here (refs resolve via the
// per-call `resolvers`, using display values the service already has in hand). Only fields
// PRESENT in the dto (!== undefined) whose value actually differs produce a change.

export type FieldChange = { field: string; label: string; from: string | null; to: string | null };

// Per-service declaration of how each updatable field is humanised:
//   scalar — shown as-is (String()); enum — mapped through `labels` (raw value as fallback);
//   ref    — id resolved to a display name via the per-call `resolvers`.
export type FieldSpec = Record<
  string,
  | { label: string; kind: "scalar" }
  | { label: string; kind: "enum"; labels?: Record<string, string> }
  | { label: string; kind: "ref" }
>;

// Per-call ref resolvers: field name -> (id -> humanised display value | null). Built by the
// service from rows already loaded (old + new relation) — no extra DB round-trip.
export type RefResolvers = Record<string, (id: string | null) => string | null>;

function normaliseId(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}

function scalarString(v: unknown): string | null {
  return v == null ? null : String(v);
}

export function diffRecord(
  oldRecord: Record<string, unknown>,
  dto: Record<string, unknown>,
  spec: FieldSpec,
  resolvers: RefResolvers = {}
): FieldChange[] {
  const changes: FieldChange[] = [];

  for (const [field, s] of Object.entries(spec)) {
    // Only consider fields the caller actually sent in this update.
    if (dto[field] === undefined) continue;

    if (s.kind === "ref") {
      const oldId = normaliseId(oldRecord[field]);
      const newId = normaliseId(dto[field]);
      if (oldId === newId) continue;
      const resolve = resolvers[field] ?? ((id) => id);
      changes.push({ field, label: s.label, from: resolve(oldId), to: resolve(newId) });
      continue;
    }

    const oldVal = scalarString(oldRecord[field]);
    const newVal = scalarString(dto[field]);
    if (oldVal === newVal) continue;

    if (s.kind === "enum") {
      const lab = (v: string | null) => (v == null ? null : s.labels?.[v] ?? v);
      changes.push({ field, label: s.label, from: lab(oldVal), to: lab(newVal) });
    } else {
      changes.push({ field, label: s.label, from: oldVal, to: newVal });
    }
  }

  return changes;
}
