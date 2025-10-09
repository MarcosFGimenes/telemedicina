const statusMap: Record<string, string> = {
  PENDING: 'Pendente',
  RECEIVED: 'Recebida',
  CONFIRMED: 'Confirmada',
  OVERDUE: 'Vencida',
  REFUNDED: 'Estornada',
  CANCELED: 'Cancelada',
  CANCELLED: 'Cancelada',
  APPROVED: 'Aprovada',
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  SUSPENDED: 'Suspenso',
  COMPLETED: 'Concluída',
  FINISHED: 'Finalizada',
  SCHEDULED: 'Agendada',
  PROCESSING: 'Processando',
  PAID: 'Paga',
  UNPAID: 'Não paga',
  AUTHORIZED: 'Autorizada',
  DECLINED: 'Recusada',
  EXPIRED: 'Expirada',
};

export const normalizeStatus = (value?: string | null): string => {
  if (!value) return 'PENDING';
  const normalized = String(value).trim().toUpperCase();
  return normalized || 'PENDING';
};

export const translateStatus = (value?: string | null): string => {
  const normalized = normalizeStatus(value);
  return statusMap[normalized] ?? normalized;
};

export const statusLabel = (value?: string | null): string => {
  const label = translateStatus(value);
  return label || '—';
};
