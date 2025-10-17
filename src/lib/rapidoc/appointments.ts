export type AppointmentListItem = {
  uuid: string;
  scheduledAt?: string;
  dateLabel?: string;
  timeLabel?: string;
  status?: string;
  specialtyName?: string;
  professionalName?: string;
  meetingUrl?: string;
  raw?: Record<string, unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
};

const stringFrom = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
};

const firstNonEmpty = (...values: (string | null | undefined)[]): string | undefined => {
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
};

const sanitizeTimeFragment = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const firstSegment = trimmed.split(/[\s-–—]+/)[0];
  const segments = firstSegment
    .split(':')
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!segments.length) {
    return undefined;
  }
  if (segments.length === 1) {
    const hours = segments[0].padStart(2, '0');
    return `${hours}:00:00`;
  }
  if (segments.length === 2) {
    const [hour, minute] = segments;
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:00`;
  }
  const [hour, minute = '00', second = '00'] = segments;
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;
};

const composeDateTimeFromParts = (
  datePart?: string | null,
  timePart?: string | null,
): string | undefined => {
  if (!datePart) return undefined;
  const trimmedDate = datePart.trim();
  if (!trimmedDate) return undefined;
  if (trimmedDate.includes('T')) {
    return trimmedDate;
  }
  const sanitizedTime = timePart && timePart.trim() ? timePart.trim() : undefined;
  const dmyMatch = trimmedDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    const base = `${yyyy}-${mm}-${dd}`;
    if (sanitizedTime) {
      return `${base}T${sanitizedTime}`;
    }
    return `${base}T00:00:00`;
  }
  const ymdMatch = trimmedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const base = `${ymdMatch[1]}-${ymdMatch[2]}-${ymdMatch[3]}`;
    if (sanitizedTime) {
      return `${base}T${sanitizedTime}`;
    }
    return `${base}T00:00:00`;
  }
  if (sanitizedTime) {
    return `${trimmedDate} ${sanitizedTime}`;
  }
  return trimmedDate;
};

export const parseAppointments = (raw: unknown): AppointmentListItem[] => {
  const containers: Record<string, unknown>[] = [];
  const queue: unknown[] = [raw];
  const keysToExplore = ['data', 'appointments', 'items', 'results'];

  while (queue.length) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    const record = asRecord(current);
    if (!record) continue;

    let forwarded = false;
    keysToExplore.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        queue.push(record[key]);
        forwarded = true;
      }
    });

    if (!forwarded) {
      containers.push(record);
    }
  }

  if (!containers.length) {
    return [];
  }

  return containers
    .map((record) => {
      const uuid = firstNonEmpty(stringFrom(record['uuid']), stringFrom(record['id']));
      if (!uuid) return null;

      const rawDate = firstNonEmpty(
        stringFrom(record['scheduledDate']),
        stringFrom(record['scheduleDate']),
        stringFrom(record['date']),
        stringFrom(record['day']),
      );
      const rawTime = firstNonEmpty(
        stringFrom(record['scheduledTime']),
        stringFrom(record['time']),
        stringFrom(record['hour']),
        stringFrom(record['from']),
        stringFrom(record['startTime']),
      );
      const normalizedTime = sanitizeTimeFragment(rawTime);
      const scheduledAt = firstNonEmpty(
        stringFrom(record['scheduledAt']),
        stringFrom(record['scheduleDateTime']),
        stringFrom(record['scheduleDate']),
        stringFrom(record['scheduledDateTime']),
        stringFrom(record['scheduledDatetime']),
        stringFrom(record['startAt']),
        stringFrom(record['startDateTime']),
        stringFrom(record['start']),
        stringFrom(record['dateTime']),
        composeDateTimeFromParts(rawDate, normalizedTime),
      );

      const specialty = asRecord(record['specialty']);
      const professional =
        asRecord(record['professional']) || asRecord(record['doctor']) || asRecord(record['physician']);

      const specialtyName = firstNonEmpty(
        stringFrom(record['specialtyName']),
        stringFrom(specialty?.['name']),
        stringFrom(specialty?.['description']),
      );
      const professionalName = firstNonEmpty(
        stringFrom(record['professionalName']),
        stringFrom(professional?.['name']),
      );
      const meetingUrl = firstNonEmpty(
        stringFrom(record['meetingUrl']),
        stringFrom(record['beneficiaryUrl']),
        stringFrom(record['url']),
        stringFrom(record['redirectUrl']),
      );
      const status = firstNonEmpty(stringFrom(record['status']), stringFrom(record['situation']));

      return {
        uuid,
        scheduledAt,
        dateLabel: rawDate,
        timeLabel: rawTime,
        status,
        specialtyName,
        professionalName,
        meetingUrl,
        raw: record,
      } as AppointmentListItem;
    })
    .filter(Boolean) as AppointmentListItem[];
};

export const appointmentDateFrom = (item: AppointmentListItem): Date | null => {
  const candidate = firstNonEmpty(
    item.scheduledAt,
    composeDateTimeFromParts(item.dateLabel, sanitizeTimeFragment(item.timeLabel)),
  );
  if (!candidate) return null;
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export const formatAppointmentDateTime = (item: AppointmentListItem): string => {
  const date = appointmentDateFrom(item);
  if (date) {
    try {
      return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
    } catch {
      // ignore formatting errors and fallback below
    }
  }
  const labelParts = [item.dateLabel, item.timeLabel].filter(Boolean) as string[];
  if (labelParts.length) {
    return labelParts.join(' • ');
  }
  return item.scheduledAt || '—';
};

export const isCanceledStatus = (value?: string): boolean => {
  const normalized = (value || '').toUpperCase();
  return normalized.includes('CANCEL');
};
