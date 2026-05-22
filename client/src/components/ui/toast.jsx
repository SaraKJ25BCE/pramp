import { createContext, useCallback, useContext, useState } from 'react';

const ToastContext = createContext(null);

let idSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message, variant = 'default') => {
      const id = ++idSeq;
      setToasts((t) => [...t, { id, message, variant }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className={`rounded-lg border px-4 py-3 text-sm shadow-lg ${
              t.variant === 'success'
                ? 'bg-green-50 border-green-200 text-green-900'
                : t.variant === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : t.variant === 'error'
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : 'bg-white border-gray-200 text-gray-900'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
