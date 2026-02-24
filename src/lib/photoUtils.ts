// Utility to handle photo_url field which can be a single URL string or a JSON array of URLs

export function parsePhotoUrls(photoUrl: string | null): string[] {
  if (!photoUrl) return [];
  try {
    const parsed = JSON.parse(photoUrl);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {
    // Legacy single URL
  }
  return [photoUrl];
}

export function serializePhotoUrls(urls: string[]): string | null {
  const filtered = urls.filter(Boolean);
  if (filtered.length === 0) return null;
  if (filtered.length === 1) return filtered[0];
  return JSON.stringify(filtered);
}

export const MAX_PHOTOS = 4;
