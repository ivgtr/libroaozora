export function buildSearchUrl(
  basePath: string,
  fields: Record<string, string>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    const trimmed = value.trim();
    if (trimmed) params.set(key, trimmed);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
