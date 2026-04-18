import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  FolderOpen,
  Check,
  X,
  Zap,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";
import type { ApprovalRequest, RiskLevel } from "../../types";

const RISK_CONFIG: Record<
  RiskLevel,
  { color: string; bg: string; border: string; icon: typeof Shield }
> = {
  low: {
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    icon: ShieldCheck,
  },
  medium: {
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    icon: Shield,
  },
  high: {
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: ShieldAlert,
  },
};

interface ApprovalOverlayProps {
  request: ApprovalRequest;
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onAllowAll: () => void;
}

export function ApprovalOverlay({
  request,
  onApprove,
  onDeny,
  onAllowAll,
}: ApprovalOverlayProps) {
  const { t } = useI18n();
  const risk = RISK_CONFIG[request.riskLevel];
  const RiskIcon = risk.icon;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 animate-in slide-in-from-bottom-2 fade-in duration-200",
        risk.bg,
        risk.border,
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <RiskIcon size={16} className={risk.color} />
        <span className="text-xs font-semibold text-foreground">
          {t("commandApproval")}
        </span>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
            risk.bg,
            risk.color,
            risk.border,
            "border",
          )}
        >
          {t(request.riskLevel)}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground mb-2">
        {t("commandDescription")}
      </p>

      {/* Command block */}
      <div className="relative rounded-md bg-black/40 border border-border p-2.5 mb-2">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Terminal size={11} className="text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-mono">
            shell
          </span>
        </div>
        <code className="text-xs font-mono text-green-300 break-all whitespace-pre-wrap">
          {request.command}
        </code>
      </div>

      {/* Working directory */}
      {request.workingDir && (
        <div className="flex items-center gap-1.5 mb-3 text-muted-foreground">
          <FolderOpen size={11} />
          <span className="text-[10px] font-mono truncate">
            {t("executionDirectory")}: {request.workingDir}
          </span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onApprove(request.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            "bg-green-600/80 hover:bg-green-600 text-white",
          )}
        >
          <Check size={12} />
          {t("allowCommand")}
        </button>
        <button
          onClick={() => onDeny(request.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            "bg-red-600/80 hover:bg-red-600 text-white",
          )}
        >
          <X size={12} />
          {t("denyCommand")}
        </button>
        <button
          onClick={onAllowAll}
          className="ml-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title={t("allowAll")}
        >
          <Zap size={10} />
          <span>{t("allowAll")}</span>
        </button>
      </div>
    </div>
  );
}

// Container that shows a queue of pending approval requests
interface ApprovalQueueProps {
  requests: ApprovalRequest[];
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  onAllowAll: () => void;
}

export function ApprovalQueue({
  requests,
  onApprove,
  onDeny,
  onAllowAll,
}: ApprovalQueueProps) {
  if (requests.length === 0) {return null;}

  return (
    <div className="flex flex-col gap-2">
      {requests.map((req) => (
        <ApprovalOverlay
          key={req.id}
          request={req}
          onApprove={onApprove}
          onDeny={onDeny}
          onAllowAll={onAllowAll}
        />
      ))}
    </div>
  );
}
