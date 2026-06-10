// Attachment content policy — the security unit for upload validation and the
// inline/attachment download decision.
//
// The allow-list below is BOTH the upload allow-list AND the inline allow-list:
// every accepted type is safe to render inline (PDF + raster images). SVG is
// deliberately absent — it can carry script and is a stored-XSS vector, so it is
// rejected at upload, not merely forced to download. The stored contentType is
// ALWAYS the magic-byte-sniffed value; the client-sent Content-Type is never
// trusted for either the accept decision or the inline decision.

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

export const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp"
] as const;

export type AllowedType = (typeof ALLOWED_TYPES)[number];

export function isAllowedType(t: string): t is AllowedType {
  return (ALLOWED_TYPES as readonly string[]).includes(t);
}

// Every allowed type is safe-to-render, so inline-eligibility == being allow-listed.
export function isInlineType(t: string): boolean {
  return isAllowedType(t);
}

/**
 * Inspect the leading bytes and return the canonical MIME ONLY if the content
 * actually matches one of the allow-listed signatures. Returns null for anything
 * else (including a file whose declared type lies about its real bytes), which the
 * caller turns into a 415. This is the gate that makes "validate the actual file,
 * not the client header" real.
 */
export function sniffContentType(buf: Buffer): AllowedType | null {
  if (!buf || buf.length < 4) return null;

  // PDF: "%PDF-"
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "application/pdf";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  // GIF: "GIF87a" or "GIF89a"
  if (buf.length >= 6) {
    const head = buf.subarray(0, 6).toString("latin1");
    if (head === "GIF87a" || head === "GIF89a") return "image/gif";
  }
  // WEBP: "RIFF" .... "WEBP"
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

// Strip control chars and anything that could break out of the header (quotes) or
// imply a path (slashes/backslashes). Char-filter (not regex) to avoid escaping
// pitfalls. Keep everything else, then cap the length.
function sanitizeFilename(name: string): string {
  const cleaned = Array.from(name || "file")
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      if (c < 0x20 || c === 0x7f) return false; // control chars + DEL
      return ch !== '"' && ch !== "\\" && ch !== "/";
    })
    .join("")
    .trim();
  return cleaned.slice(0, 200) || "file";
}

/**
 * Build a safe Content-Disposition header. Includes both a plain `filename=` (ASCII
 * fallback) and an RFC 5987 `filename*=UTF-8''…` for non-ASCII names.
 */
export function contentDispositionHeader(
  disposition: "inline" | "attachment",
  filename: string
): string {
  const safe = sanitizeFilename(filename);
  const ascii = Array.from(safe)
    .map((ch) => (ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) <= 0x7e ? ch : "_"))
    .join("");
  const encoded = encodeURIComponent(safe);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
