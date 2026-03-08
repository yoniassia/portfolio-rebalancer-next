import { useState, useEffect, useRef, useCallback } from 'react';

interface UsePollingResult<T> {
  data: T | null;
  error: Error | null;
  isPolling: boolean;
}

export function usePolling<T>(
  fn: () => Promise<T>,
  intervalMs: number,
  enabled: boolean,
): UsePollingResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const poll = useCallback(async () => {
    try {
      const result = await fnRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Polling failed'));
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsPolling(false);
      return;
    }

    setIsPolling(true);
    poll(); // immediate first call

    const id = setInterval(poll, intervalMs);
    return () => {
      clearInterval(id);
      setIsPolling(false);
    };
  }, [enabled, intervalMs, poll]);

  return { data, error, isPolling };
}
