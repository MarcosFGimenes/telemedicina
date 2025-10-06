'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type PollingFn = () => Promise<boolean | void> | boolean | void;

type PollingOptions = {
  interval?: number;
  maxAttempts?: number;
  autoStart?: boolean;
};

export function usePolling(fn: PollingFn, options?: PollingOptions) {
  const interval = options?.interval ?? 6000;
  const maxAttempts = options?.maxAttempts ?? 20;
  const autoStart = options?.autoStart ?? false;

  const fnRef = useRef(fn);
  fnRef.current = fn;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);

  const [running, setRunning] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
  }, []);

  const tick = useCallback(async () => {
    attemptsRef.current += 1;
    setAttempts(attemptsRef.current);

    const result = await fnRef.current();

    if (result === true || attemptsRef.current >= maxAttempts) {
      stop();
      return;
    }

    timerRef.current = setTimeout(tick, interval);
  }, [interval, maxAttempts, stop]);

  const start = useCallback(() => {
    if (running) {
      return;
    }
    attemptsRef.current = 0;
    setAttempts(0);
    setRunning(true);
    timerRef.current = setTimeout(tick, 0);
  }, [running, tick]);

  useEffect(() => {
    if (autoStart) {
      start();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [autoStart, start]);

  return {
    start,
    stop,
    running,
    attempts,
  };
}