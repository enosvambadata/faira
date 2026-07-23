// Escape a string for safe interpolation into HTML (transactional email
// bodies). Covers the five characters that can break out of text or attribute
// context. `&` is replaced first so the other entities are not double-escaped.
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
