const BRAZIL_TIME_ZONE = 'America/Sao_Paulo';

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const brazilianPattern = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/;

const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });
const dateFormatterTZ = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: BRAZIL_TIME_ZONE,
});
const dateTimeFormatterTZ = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: BRAZIL_TIME_ZONE,
});
const shortDateFormatterTZ = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: BRAZIL_TIME_ZONE,
});

const pad = (value: number) => String(value).padStart(2, '0');

const isValidDateParts = (year: number, month: number, day: number) => {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const maxDay = new Date(year, month, 0).getDate();
  return day <= maxDay;
};

const buildIso = (year: number, month: number, day: number) => {
  return `${year}-${pad(month)}-${pad(day)}`;
};

const formatIsoParts = (year: number, month: number, day: number) => {
  if (!isValidDateParts(year, month, day)) return '—';
  const date = new Date(Date.UTC(year, month - 1, day));
  const monthName = monthFormatter.format(date);
  return `${pad(day)} de ${monthName} de ${year}`;
};

const formatIsoShort = (year: number, month: number, day: number) => {
  if (!isValidDateParts(year, month, day)) return '—';
  return `${pad(day)}/${pad(month)}/${year}`;
};

const normalizeTwoDigitYear = (value: number) => {
  if (value >= 100) return value;
  if (value >= 50) return 1900 + value;
  return 2000 + value;
};

export const BRAZILIAN_TIME_ZONE = BRAZIL_TIME_ZONE;

export const normalizeBrazilianDate = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isoMatch = isoDatePattern.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return isValidDateParts(year, month, day) ? buildIso(year, month, day) : null;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 8) {
    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));
    const year = Number(digits.slice(4, 8));
    return isValidDateParts(year, month, day) ? buildIso(year, month, day) : null;
  }

  const brMatch = brazilianPattern.exec(trimmed.replace(/\s+/g, ''));
  if (brMatch) {
    const day = Number(brMatch[1]);
    const month = Number(brMatch[2]);
    const year = normalizeTwoDigitYear(Number(brMatch[3]));
    return isValidDateParts(year, month, day) ? buildIso(year, month, day) : null;
  }

  return null;
};

export const toDateTimestamp = (value?: string | null): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = isoDatePattern.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!isValidDateParts(year, month, day)) return null;
    return Date.UTC(year, month - 1, day, 3, 0, 0, 0);
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const parsed = new Date(trimmed);
  const time = parsed.getTime();
  return Number.isNaN(time) ? null : time;
};

export const formatDateDisplay = (value?: string | null): string => {
  if (!value) return '—';
  const trimmed = value.trim();
  if (!trimmed) return '—';
  const isoMatch = isoDatePattern.exec(trimmed);
  if (isoMatch) {
    return formatIsoParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }
  const timestamp = toDateTimestamp(trimmed);
  if (timestamp == null) return '—';
  return dateFormatterTZ.format(new Date(timestamp));
};

export const formatDateTimeDisplay = (value?: string | null): string => {
  if (!value) return '—';
  const trimmed = value.trim();
  if (!trimmed) return '—';
  const isoMatch = isoDatePattern.exec(trimmed);
  if (isoMatch) {
    return formatIsoParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }
  const timestamp = toDateTimestamp(trimmed);
  if (timestamp == null) return '—';
  return dateTimeFormatterTZ.format(new Date(timestamp));
};

export const formatShortDateDisplay = (value?: string | null): string => {
  if (!value) return '—';
  const trimmed = value.trim();
  if (!trimmed) return '—';
  const isoMatch = isoDatePattern.exec(trimmed);
  if (isoMatch) {
    return formatIsoShort(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }
  const timestamp = toDateTimestamp(trimmed);
  if (timestamp == null) return '—';
  return shortDateFormatterTZ.format(new Date(timestamp));
};

export const formatIsoDate = (value?: string | null): string => {
  if (!value) return '—';
  const trimmed = value.trim();
  if (!trimmed) return '—';
  const isoMatch = isoDatePattern.exec(trimmed);
  if (!isoMatch) return '—';
  return formatIsoParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
};

export const formatIsoShortDate = (value?: string | null): string => {
  if (!value) return '—';
  const trimmed = value.trim();
  if (!trimmed) return '—';
  const isoMatch = isoDatePattern.exec(trimmed);
  if (!isoMatch) return '—';
  return formatIsoShort(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
};

export const describeDateRange = (start?: string | null, end?: string | null): string => {
  const startLabel = formatShortDateDisplay(start);
  const endLabel = formatShortDateDisplay(end);
  if (startLabel === '—' && endLabel === '—') return '—';
  if (startLabel === '—') return endLabel;
  if (endLabel === '—') return startLabel;
  return `${startLabel} • ${endLabel}`;
};
