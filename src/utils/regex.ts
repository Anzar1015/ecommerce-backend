/** Escapes regex metacharacters so user search input is safe to embed in a RegExp literal. */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
