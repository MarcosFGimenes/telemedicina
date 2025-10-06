export const onlyDigits = (value: string) => value.replace(/\D/g, '');

export const parseCurrencyInput = (value: string) => {
  const normalized = value.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const formatCurrency = (value: number) =>
  Number.isFinite(value) ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'R$ 0,00';

export const formatDateInput = (value?: string) => {
  if (!value) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

export const isValidEmail = (value: string) =>
  /^[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+$/.test(value);

export const isValidCpf = (value: string) => {
  const digits = onlyDigits(value);
  return digits.length === 11;
};