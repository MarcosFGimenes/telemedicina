const DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]+/g;
const LEADING_TRAILING_HYPHEN_REGEX = /^-+|-+$/g;
const MULTIPLE_HYPHENS_REGEX = /-{2,}/g;

/**
 * Transforma uma string em um slug consistente: minúsculo, sem acentos e separado por hífens.
 */
export function slugify(input: string): string {
  if (!input) {
    return '';
  }

  const normalized = input
    .normalize('NFD')
    .replace(DIACRITICS_REGEX, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_REGEX, '-')
    .replace(MULTIPLE_HYPHENS_REGEX, '-')
    .replace(LEADING_TRAILING_HYPHEN_REGEX, '');

  return normalized;
}

/**
 * Recebe uma lista de valores e retorna o primeiro slug válido gerado.
 */
export function firstAvailableSlug(...candidates: (string | undefined | null)[]): string {
  for (const candidate of candidates) {
    const slug = slugify(String(candidate || '').trim());
    if (slug) {
      return slug;
    }
  }
  return '';
}
