import { useCallback, useEffect, useRef, useState } from "react";

const EVENTS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Deteksi tidak ada sentuhan. Setelah `warnAfterMs` muncul peringatan dengan hitung mundur
 * `countdownSeconds`; sentuhan apa pun membatalkannya, kalau habis `onTimeout` dipanggil.
 */
export function useIdle({
  enabled,
  warnAfterMs,
  countdownSeconds,
  onTimeout,
}: {
  enabled: boolean;
  warnAfterMs: number;
  countdownSeconds: number;
  onTimeout: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActive = useRef(Date.now());
  const timeoutRef = useRef(onTimeout);
  timeoutRef.current = onTimeout;

  const dismiss = useCallback(() => {
    lastActive.current = Date.now();
    setSecondsLeft(null);
  }, []);

  useEffect(() => {
    const touch = () => {
      lastActive.current = Date.now();
    };
    for (const e of EVENTS) window.addEventListener(e, touch, { passive: true, capture: true });
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, touch, { capture: true });
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setSecondsLeft(null);
      return;
    }
    lastActive.current = Date.now();
    const t = setInterval(() => {
      const idleMs = Date.now() - lastActive.current;
      if (idleMs < warnAfterMs) {
        setSecondsLeft(null);
        return;
      }
      const left = countdownSeconds - Math.floor((idleMs - warnAfterMs) / 1000);
      if (left <= 0) {
        setSecondsLeft(null);
        lastActive.current = Date.now();
        timeoutRef.current();
      } else setSecondsLeft(left);
    }, 250);
    return () => clearInterval(t);
  }, [enabled, warnAfterMs, countdownSeconds]);

  return { warning: secondsLeft !== null, secondsLeft: secondsLeft ?? 0, dismiss };
}
