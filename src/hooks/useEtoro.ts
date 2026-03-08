import { useState, useCallback, useRef } from 'react';
import { EToroTrading } from 'etoro-sdk';

let etoroInstance: EToroTrading | null = null;

export function useEtoro() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const instanceRef = useRef(etoroInstance);

  const connect = useCallback(async (apiKey: string, userKey: string, mode: 'demo' | 'real') => {
    setIsConnecting(true);
    setError(null);
    try {
      const etoro = new EToroTrading({ apiKey, userKey, mode });
      await etoro.getPortfolio(); // test connection
      etoroInstance = etoro;
      instanceRef.current = etoro;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (etoroInstance) {
      etoroInstance.disconnect().catch(() => {});
      etoroInstance = null;
      instanceRef.current = null;
    }
  }, []);

  return {
    etoro: instanceRef.current,
    isConnecting,
    error,
    connect,
    disconnect,
  };
}
