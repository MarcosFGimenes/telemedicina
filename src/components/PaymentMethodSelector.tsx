'use client';

import clsx from 'clsx';
import type { BillingType } from '@/types/checkout';

type MethodOption = {
  value: BillingType;
  label: string;
  description: string;
  disabled?: boolean;
};

type PaymentMethodSelectorProps = {
  value: BillingType;
  onChange: (value: BillingType) => void;
  pixAvailable: boolean;
};

const baseOptions: MethodOption[] = [
  {
    value: 'BOLETO',
    label: 'Boleto',
    description: 'Gerar boleto bancario com vencimento definido.',
  },
  {
    value: 'CREDIT_CARD',
    label: 'Cartão de crédito',
    description: 'Processar cobrança usando cartão de crédito sandbox.',
  },
  {
    value: 'UNDEFINED',
    label: 'Checkout Asaas',
    description: 'Redirecionar para o checkout do Asaas e escolher o método na hora.',
  },
  {
    value: 'PIX',
    label: 'PIX',
    description: 'Gerar QR Code PIX com confirmação em tempo real.',
  },
];

export default function PaymentMethodSelector({ value, onChange, pixAvailable }: PaymentMethodSelectorProps) {
  const options = baseOptions.map((option) =>
    option.value === 'PIX' && !pixAvailable
      ? { ...option, description: 'Disponível em breve – use Boleto ou Cartão por enquanto.', disabled: true }
      : option,
  );

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {options.map((option) => {
        const isActive = option.value === value;
        const isDisabled = Boolean(option.disabled);

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => !isDisabled && onChange(option.value)}
            disabled={isDisabled}
            className={clsx(
              'rounded-lg border px-4 py-3 text-left shadow-sm transition',
              isActive ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white',
              isDisabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <span className="block text-sm font-semibold">{option.label}</span>
            <span className="mt-1 block text-xs text-inherit/80">{option.description}</span>
            {isActive && !isDisabled && (
              <span className="mt-2 inline-block rounded-full bg-white/20 px-2 py-0.5 text-[10px] uppercase">
                Selecionado
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}