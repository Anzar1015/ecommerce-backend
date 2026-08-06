/**
 * Converts arbitrary text into a URL-safe slug, e.g. "Nike Air Max 90" -> "nike-air-max-90".
 */
export function slugify(text: string): string {
  return text
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
