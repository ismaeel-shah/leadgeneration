export type ParsedLinkedInProfile = {
  normalizedUrl: string;
  slug: string;
  suggestedName: string;
  firstName: string;
};

/**
 * Accepts LinkedIn profile links, including mobile and locale-prefixed links.
 * Invalid links return null so callers can show a useful validation message.
 */
export function parseLinkedInProfileUrl(input: string): ParsedLinkedInProfile | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (!(["http:", "https:"].includes(url.protocol))) return null;
  if (url.username || url.password || url.port) return null;
  if (!["linkedin.com", "www.linkedin.com", "m.linkedin.com", "mobile.linkedin.com"].includes(url.hostname.toLowerCase())) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  // LinkedIn may prefix paths with a locale, e.g. /en/in/name or /en-us/in/name.
  if (/^[a-z]{2}(?:-[a-z]{2})?$/i.test(segments[0] ?? "") && segments[1]?.toLowerCase() === "in") {
    segments.shift();
  }
  if (segments[0]?.toLowerCase() !== "in" || !segments[1]) return null;

  let slug: string;
  try {
    slug = decodeURIComponent(segments[1]).normalize("NFKC").toLowerCase();
  } catch {
    return null;
  }
  if (!/^[\p{L}\p{N}._-]+$/u.test(slug) || slug === "." || slug === "..") return null;

  const normalizedUrl = `linkedin.com/in/${encodeURIComponent(slug)}`;
  const nameParts = slug.replace(/[._]/g, "-").split("-").filter(Boolean);
  if (nameParts.length > 1 && /\d/.test(nameParts[nameParts.length - 1])) nameParts.pop();
  const suggestedName = nameParts
    .map((part) => part.slice(0, 1).toLocaleUpperCase("en") + part.slice(1))
    .join(" ");

  return {
    normalizedUrl,
    slug,
    suggestedName,
    firstName: nameParts[0] ? nameParts[0].slice(0, 1).toLocaleUpperCase("en") + nameParts[0].slice(1) : "",
  };
}

export function normalizeLinkedInUrl(input: string): string | null {
  return parseLinkedInProfileUrl(input)?.normalizedUrl ?? null;
}

// Kept as a spelling alias for integrations using the brand's lowercase "in".
export const normalizeLinkedinUrl = normalizeLinkedInUrl;
