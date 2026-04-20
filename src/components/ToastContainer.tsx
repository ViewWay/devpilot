import { useState } from "react";
import { useToastStore, type ToastType } from "../stores/toastStore";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "../lib/utils";

const ICONS: Record<ToastType, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
  error: AlertCircle,
};

const TYPE_STYLES: Record<ToastType, string> = {
  info: "bg-secondary/10 border-secondary/30 text-foreground",
  success: "bg-success/10 border-success/30 text-foreground",
  warning: "bg-warning/10 border-warning/30 text-foreground",
  error: "bg-error/10 border-error/30 text-foreground",
};

const ICON_STYLES: Record<ToastType, string> = {
  info: "text-secondary",
  success: "text-success",
  warning: "text-warning",
  error: "text-error",
};

function ToastItem({ id, type, message }: { id: string; type: ToastType; message: string }) {
  const removeToast = useToastStore((s) => s.removeToast);
  const [isExiting, setIsExiting] = useState(false);
  const Icon = ICONS[type];

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => removeToast(id), 200);
  };

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 shadow-lg backdrop-blur-sm transition-all duration-200 min-w-[280px] max-w-[420px]",
        TYPE_STYLES[type],
        isExiting ? "opacity-0 translate-x-4 scale-95" : "opacity-100 translate-x-0 scale-100",
      )}
    >
      <Icon size={15} className={cn("shrink-0 mt-0.5", ICON_STYLES[type])} />
      <p className="flex-1 text-xs leading-relaxed">{message}</p>
      <button
        onClick={handleClose}
        className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X size={12} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);

  // Limit visible toasts
  const visible = toasts.slice(-5);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2">
      {visible.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem id={t.id} type={t.type} message={t.message} />
        </div>
      ))}
    </div>
  );
}
