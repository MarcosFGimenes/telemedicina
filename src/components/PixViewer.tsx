'use client';

import { useEffect, useMemo, useState } from 'react';
import { copyToClipboard } from '@/utils/clipboard';

export type PixViewerProps = {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string | null;
  status?: string;
};

const formatRemaining = (target?: string | null) => {
  if (!target) {
    return null;
  }

  const expires = new Date(target);
  if (Number.isNaN(expires.getTime())) {
    return null;
  }

  const diff = expires.getTime() - Date.now();
  if (diff <= 0) {
    return 'Expirado';
  }

  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export default function PixViewer({ encodedImage, payload, expirationDate, status }: PixViewerProps) {
  const [remaining, setRemaining] = useState<string | null>(formatRemaining(expirationDate));
  const [copied, setCopied] = useState(false);

  const expired = useMemo(() => remaining === 'Expirado', [remaining]);

  useEffect(() => {
    setRemaining(formatRemaining(expirationDate));

    if (!expirationDate) {
      return;
    }

    const timer = setInterval(() => {
      setRemaining(formatRemaining(expirationDate));
    }, 1000);

    return () => clearInterval(timer);
  }, [expirationDate]);

  if (!encodedImage && !payload) {
    return null;
  }

  const handleCopy = async () => {
    if (!payload) {
      return;
    }
    try {
      await copyToClipboard(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('copy failed', error);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-white p-4">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>QR Code PIX</span>
        {status && <span className="text-xs uppercase text-zinc-500">{status}</span>}
      </div>

      {encodedImage ? (
        <img
          src={`data:image/png;base64,${encodedImage}`}
          alt="QR Code PIX"
          className="mx-auto h-56 w-56 rounded-md border"
        />
      ) : (
        <p className="text-sm text-zinc-500">QR Code não retornado.</p>
      )}

      {payload && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Código copia e cola</label>
          <textarea
            readOnly
            className="h-24 w-full rounded-md border px-3 py-2 text-xs"
            value={payload}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-md border border-zinc-300 px-3 py-1 text-sm"
          >
            {copied ? 'Copiado!' : 'Copiar código'}
          </button>
        </div>
      )}

      {remaining && (
        <p className="text-xs text-zinc-500">
          Expira em: <span className={expired ? 'text-red-500' : undefined}>{remaining}</span>
        </p>
      )}
    </div>
  );
}