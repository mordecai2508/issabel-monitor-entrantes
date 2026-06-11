import { useState, useEffect, useRef } from 'react';

export function useSSE(url, { onInit, onUpdate, onPbxStatus } = {}) {
  const [connected, setConnected]   = useState(false);
  const [lastEvent, setLastEvent]   = useState(null);
  const esRef = useRef(null);

  useEffect(() => {
    let retryTimer = null;

    function connect() {
      const es = new EventSource(url, { withCredentials: true });
      esRef.current = es;

      es.addEventListener('init', (e) => {
        const data = JSON.parse(e.data);
        setLastEvent(data);
        setConnected(true);
        onInit?.(data);
      });

      es.addEventListener('update', (e) => {
        const data = JSON.parse(e.data);
        setLastEvent(data);
        onUpdate?.(data);
      });

      es.addEventListener('pbx_status', (e) => {
        const data = JSON.parse(e.data);
        onPbxStatus?.(data);
      });

      es.onerror = () => {
        es.close();
        setConnected(false);
        // Reconectar después de 10 s
        retryTimer = setTimeout(connect, 10_000);
      };
    }

    connect();

    return () => {
      esRef.current?.close();
      clearTimeout(retryTimer);
    };
  }, [url]);

  return { connected, lastEvent };
}
