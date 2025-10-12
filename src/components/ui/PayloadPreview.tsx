'use client';

import clsx from 'clsx';
import { useMemo, useState } from 'react';

type PayloadPreviewProps = {
  data: unknown;
  title?: string;
  description?: string;
  defaultOpen?: boolean;
  className?: string;
};

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return 'Não foi possível exibir os detalhes técnicos desse retorno.';
  }
};

export default function PayloadPreview({
  data,
  title = 'Detalhes técnicos',
  description,
  defaultOpen = false,
  className,
}: PayloadPreviewProps) {
  const [open, setOpen] = useState(defaultOpen);
  const content = useMemo(() => safeStringify(data), [data]);

  if (data == null) {
    return null;
  }

  return (
    <div className={clsx('rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-emerald-700">{title}</p>
          {description && <p className="text-xs text-zinc-500">{description}</p>}
        </div>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className="inline-flex items-center justify-center rounded-full border border-emerald-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-50"
        >
          {open ? 'Ocultar detalhes' : 'Ver detalhes'}
        </button>
      </div>
      {open && (
        <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-[11px] leading-relaxed text-emerald-700">
          {content}
        </pre>
      )}
    </div>
  );
}
