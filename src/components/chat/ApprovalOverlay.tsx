import { useState } from "react";
import { Shield, ShieldAlert, ShieldCheck, Check, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ApprovalRequest, RiskLevel } from "../../types";

const riskConfig: Record<RiskLevel, { icon: typeof Shield; color: string; bg: string; border: string; label: string }> = {
  low: { icon: ShieldCheck, color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30", label: "Low Risk" },
  medium: { icon: ShieldAlert, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", label: "Medium Risk" },
  high: { icon: ShieldAlert, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", label: "High Risk" },
};

interface ApprovalOverlayProps {
  request: ApprovalRequest;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onAlwaysAllow?: (id: string) => void;
}

export function ApprovalOverlay({ request, onApprove, onReject, onAlwaysAllow }: ApprovalOverlayProps) {
  const [expanded, setExpanded] = useState(false);
  const risk = riskConfig[request.riskLevel];
  const RiskIcon = risk.icon;

  return (
    <div className="mx-auto max-w-3xl px-4 py-2">
      <div className={cn("rounded-lg border p-3 shadow-lg", risk.border, risk.bg)}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <RiskIcon size={16} className={risk.color} />
          <span className="text-xs font-semibold text-foreground">Command Approval</span>
          <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium", risk.color, risk.bg)}>
            {risk.label}
          </span>
        </div>

        {/* Command */}
        <div className="rounded-md bg-background/80 p-2.5 mb-2 font-mono text-xs leading-relaxed text-foreground">
          <span className="text-muted-foreground">$ </span>
          <span className="break-all">{request.command}</span>
        </div>

        {/* Description */}
        {request.description && (
          <p className="text-[11px] text-muted-foreground mb-2">{request.description}</p>
        )}

        {/* Working Dir */}
        {request.workingDir && (
          <div className="text-[10px] text-muted-foreground mb-2 font-mono">
            cwd: {request.workingDir}
          </div>
        )}

        {/* Expandable details */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          {expanded ? "Less" : "Details"}
        </button>

        {expanded && (
          <div className="mb-2 rounded-md bg-background/50 p-2 text-[10px] text-muted-foreground space-y-1">
            <div className="flex justify-between">
              <span>Tool Call ID:</span>
              <span className="font-mono">{request.toolCallId.slice(0, 8)}...</span>
            </div>
            <div className="flex justify-between">
              <span>Request ID:</span>
              <span className="font-mono">{request.id.slice(0, 8)}...</span>
            </div>
            <div className="flex justify-between">
              <span>Time:</span>
              <span>{request.createdAt}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onReject(request.id)}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive"
          >
            <X size={12} />
            Reject
          </button>
          <button
            onClick={() => onApprove(request.id)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Check size={12} />
            Approve
          </button>
          {onAlwaysAllow && (
            <button
              onClick={() => onAlwaysAllow(request.id)}
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Always allow
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
