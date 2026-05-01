import { useState, useMemo, lazy, Suspense } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  FolderOpen,
  FileEdit,
  Check,
  X,
  Zap,
  ChevronDown,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";
import type { ApprovalRequest, RiskLevel } from "../../types";

/* -------------------------------------------------------------------------- */
/*  Lazy-loaded DiffViewer                                                    */
/* -------------------------------------------------------------------------- */

const ReactDiffViewer = lazy(() =>
  import("react-diff-viewer-continued").then((mod) => ({
    default: mod.default,
  })),
);

function DiffViewerLoader() {
  return (
    <div className="flex items-center justify-center py-4">
      <Loader2 size={14} className="animate-spin text-muted-foreground" />
      <span className="ml-2 text-xs text-muted-foreground">Loading diff...</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Risk config                                                               */
/* -------------------------------------------------------------------------- */

const RISK_CONFIG: Record<
  RiskLevel,
  { color: string; bg: string; border: string; icon: typeof Shield }
> = {
  low: {
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/30",
    icon: ShieldCheck,
  },
  medium: {
    color: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/30",
    icon: Shield,
  },
  high: {
    color: "text-error",
    bg: "bg-error/10",
    border: "border-error/30",
    icon: ShieldAlert,
  },
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** File-edit / write / patch tool names that benefit from diff preview. */
const FILE_EDIT_TOOLS = new Set([
  "file_edit",
  "apply_patch",
  "file_write",
  "write_file",
  "patch",
]);

function isFileEditTool(request: ApprovalRequest): boolean {
  if (request.toolName && FILE_EDIT_TOOLS.has(request.toolName)) {
    return true;
  }
  // Fallback: check description
  const desc = request.description.toLowerCase();
  return (
    desc.includes("file_edit") ||
    desc.includes("apply_patch") ||
    desc.includes("file_write") ||
    desc.includes("write_file") ||
    desc.includes("patch")
  );
}

function isShellTool(request: ApprovalRequest): boolean {
  if (request.toolName) {
    return (
      request.toolName === "shell_exec" ||
      request.toolName === "terminal" ||
      request.toolName === "exec"
    );
  }
  const desc = request.description.toLowerCase();
  return desc.includes("shell") || desc.includes("exec");
}

/** Try to extract old/new content and file path from toolInput JSON. */
function parseFileEditInput(
  toolInput?: string,
): { filePath: string; oldContent: string; newContent: string } | null {
  if (!toolInput) {return null;}
  try {
    const parsed = JSON.parse(toolInput) as Record<string, unknown>;
    const filePath =
      (parsed["path"] as string) ??
      (parsed["file_path"] as string) ??
      (parsed["filePath"] as string) ??
      "";
    const oldContent =
      (parsed["oldContent"] as string) ??
      (parsed["old"] as string) ??
      (parsed["currentContent"] as string) ??
      "";
    const newContent =
      (parsed["newContent"] as string) ??
      (parsed["new"] as string) ??
      (parsed["content"] as string) ??
      "";
    if (!filePath && !oldContent && !newContent) {return null;}
    return { filePath, oldContent, newContent };
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Diff preview sub-component                                                */
/* -------------------------------------------------------------------------- */

function DiffPreviewSection({ request }: { request: ApprovalRequest }) {
  const { t } = useI18n();
  const [showDiff, setShowDiff] = useState(false);

  const editData = useMemo(
    () => parseFileEditInput(request.toolInput),
    [request.toolInput],
  );

  if (!editData) {return null;}

  const { filePath, oldContent, newContent } = editData;
  const fileName = filePath.split("/").pop() ?? filePath;

  return (
    <div className="rounded-md border border-border overflow-hidden mb-2">
      {/* Diff toggle header */}
      <button
        onClick={() => setShowDiff(!showDiff)}
        className="flex w-full items-center gap-2 bg-muted/40 px-3 py-1.5 text-left text-xs transition-colors hover:bg-muted/60"
      >
        {showDiff ? (
          <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
        )}
        <FileEdit size={12} className="shrink-0 text-secondary" />
        <span className="font-medium text-foreground">
          {t("approvalDiffPreview")}
        </span>
        {fileName && (
          <span className="truncate text-muted-foreground">{fileName}</span>
        )}
        <span className="ml-auto flex items-center gap-2 text-[10px]">
          {newContent && !oldContent && (
            <span className="rounded-full bg-success/20 px-1.5 py-0.5 text-success">
              new file
            </span>
          )}
          {oldContent && newContent && (
            <>
              <span className="rounded-full bg-success/20 px-1.5 py-0.5 text-success">
                +{newContent.split("\n").length}
              </span>
              <span className="rounded-full bg-error/20 px-1.5 py-0.5 text-error">
                -{oldContent.split("\n").length}
              </span>
            </>
          )}
        </span>
      </button>

      {/* Diff viewer */}
      {showDiff && (
        <div className="border-t border-border max-h-[300px] overflow-y-auto">
          <Suspense fallback={<DiffViewerLoader />}>
            <ReactDiffViewer
              oldValue={oldContent}
              newValue={newContent}
              splitView={false}
              hideLineNumbers={false}
              showDiffOnly={true}
              styles={{
                diffContainer: {
                  fontSize: "11px",
                  fontFamily:
                    'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                },
                line: {
                  padding: "0 8px",
                },
              }}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Shell command preview                                                     */
/* -------------------------------------------------------------------------- */

function ShellPreviewSection({ request }: { request: ApprovalRequest }) {
  // Extract just the command portion (strip the tool name prefix)
  const command = request.command;
  return (
    <div className="relative rounded-md bg-inverse-surface/40 border border-border p-2.5 mb-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Terminal size={11} className="text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground font-mono">
          shell
        </span>
      </div>
      <code className="text-xs font-mono text-inverse-on-surface/80 break-all whitespace-pre-wrap">
        {command}
      </code>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main ApprovalOverlay                                                      */
/* -------------------------------------------------------------------------- */

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

  const fileEdit = isFileEditTool(request);
  const shellCmd = isShellTool(request);

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

      {/* File edit diff preview */}
      {fileEdit && <DiffPreviewSection request={request} />}

      {/* Shell command preview (if not a file edit) */}
      {shellCmd && !fileEdit && <ShellPreviewSection request={request} />}

      {/* Generic command block (fallback for non-shell, non-file-edit tools) */}
      {!shellCmd && !fileEdit && (
        <div className="relative rounded-md bg-inverse-surface/40 border border-border p-2.5 mb-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Terminal size={11} className="text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground font-mono">
              {request.toolName ?? "tool"}
            </span>
          </div>
          <code className="text-xs font-mono text-inverse-on-surface/80 break-all whitespace-pre-wrap">
            {request.command}
          </code>
        </div>
      )}

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
            "bg-success/80 hover:bg-success text-on-primary",
          )}
        >
          <Check size={12} />
          {t("allowCommand")}
        </button>
        <button
          onClick={() => onDeny(request.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            "bg-error/80 hover:bg-error text-on-primary",
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

/* -------------------------------------------------------------------------- */
/*  Approval queue container                                                  */
/* -------------------------------------------------------------------------- */

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
