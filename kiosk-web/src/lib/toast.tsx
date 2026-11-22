import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "./utils";

interface Toast {
  id: number;
  kind: "success" | "error";
  text: string;
}

const ToastContext = createContext<(kind: Toast["kind"], text: string) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
    // Pesan sama beruntun (mis. tap + berkali-kali) cukup tampil sekali.
    setToasts((t) => t.filter((x, i, all) => all.findIndex((y) => y.text === x.text) === i));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-24 z-[1000] mx-auto flex w-[32rem] max-w-[90vw] flex-col gap-2 text-base"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div key={t.id} className={cn("toast", t.kind === "success" ? "toast-success" : "toast-error")}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
