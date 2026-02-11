"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

type ToastVariant = "success" | "error" | "info";

type ToastEntry = {
  id: string;
  message: string;
  variant: ToastVariant;
  removing: boolean;
};

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 5000;
const FADE_OUT_MS = 300;

const variantStyles: Record<ToastVariant, string> = {
  success:
    "border-tide-500/40 bg-tide-500/10 text-tide-700",
  error:
    "border-red-300 bg-red-50 text-red-700",
  info:
    "border-ink-500/30 bg-cream-100 text-ink-700"
};

const variantLabels: Record<ToastVariant, string> = {
  success: "Success",
  error: "Error",
  info: "Info"
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const prefix = useId();
  const counterRef = useRef(0);

  const addToast = useCallback(
    (variant: ToastVariant, message: string) => {
      counterRef.current += 1;
      const id = `${prefix}-toast-${counterRef.current}`;
      setToasts((current) => [...current, { id, message, variant, removing: false }]);
    },
    [prefix]
  );

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const startRemoval = useCallback((id: string) => {
    setToasts((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, removing: true } : entry))
    );
    setTimeout(() => removeToast(id), FADE_OUT_MS);
  }, [removeToast]);

  const api: ToastApi = useMemo(
    () => ({
      success: (message: string) => addToast("success", message),
      error: (message: string) => addToast("error", message),
      info: (message: string) => addToast("info", message)
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={() => startRemoval(toast.id)}
            onExpire={() => startRemoval(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
  onExpire
}: {
  toast: ToastEntry;
  onDismiss: () => void;
  onExpire: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onExpire, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <div
      role="status"
      className={[
        "flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold shadow-panel",
        "transition-all duration-300",
        toast.removing ? "translate-x-4 opacity-0" : "translate-x-0 opacity-100",
        variantStyles[toast.variant]
      ].join(" ")}
    >
      <span className="sr-only">{variantLabels[toast.variant]}:</span>
      <span>{toast.message}</span>
      <button
        type="button"
        className="ml-2 text-current opacity-60 hover:opacity-100"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        &times;
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
