/**
 * RemotePage — Remote device connection management page.
 *
 * Features:
 *  - QR code display area (SVG placeholder)
 *  - Connection URL display
 *  - Connected devices list with disconnect button
 *  - Toggle server on/off
 *  - Status indicator (running/stopped)
 */

import { useEffect, useState, useCallback } from "react";
import {
  Wifi,
  WifiOff,
  MonitorSmartphone,
  Copy,
  Power,
  Trash2,
  Loader2,
  QrCode,
  ExternalLink,
} from "lucide-react";
import { invoke } from "../lib/ipc";
import { useI18n } from "../i18n";
import { cn } from "../lib/utils";

// ── Types ──────────────────────────────────────────────────

interface ConnectedDevice {
  id: string;
  name: string;
  platform?: string;
  connectedAt: string;
}

interface RemoteStatus {
  running: boolean;
  url: string;
  port: number;
  connectedDevices: ConnectedDevice[];
}

// ── Placeholder QR SVG ─────────────────────────────────────

function QrPlaceholder({ url }: { url: string }) {
  return (
    <div
      className="w-48 h-48 mx-auto rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2"
      style={{ borderColor: "var(--color-border)" }}
    >
      <QrCode size={40} className="text-muted-foreground" />
      <span className="text-[10px] text-muted-foreground text-center px-4 break-all">
        QR for {url || "..."}
      </span>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────

export function RemotePage() {
  useI18n();
  const [status, setStatus] = useState<RemoteStatus>({
    running: false,
    url: "",
    port: 0,
    connectedDevices: [],
  });
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);

  // Fetch status
  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const result = await invoke<RemoteStatus>("remote_get_status", {});
      setStatus(
        result ?? { running: false, url: "", port: 0, connectedDevices: [] },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Toggle server
  const handleToggle = useCallback(async () => {
    try {
      setToggling(true);
      setError(null);
      if (status.running) {
        await invoke("remote_stop_server", {});
        setStatus((prev) => ({ ...prev, running: false }));
      } else {
        const result = await invoke<RemoteStatus>("remote_start_server", {});
        setStatus(
          result ?? {
            running: true,
            url: "http://localhost:8765",
            port: 8765,
            connectedDevices: [],
          },
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setToggling(false);
    }
  }, [status.running]);

  // Disconnect device
  const handleDisconnect = useCallback(async (deviceId: string) => {
    try {
      await invoke("remote_disconnect_device", { deviceId });
      setStatus((prev) => ({
        ...prev,
        connectedDevices: prev.connectedDevices.filter((d) => d.id !== deviceId),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Copy URL
  const handleCopyUrl = useCallback(async () => {
    if (!status.url) {return;}
    try {
      await navigator.clipboard.writeText(status.url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch {
      // fallback: ignore
    }
  }, [status.url]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <Loader2 size={16} className="mr-2 animate-spin" />
        Loading remote connections...
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full overflow-y-auto"
      style={{
        background: "var(--color-surface)",
        color: "var(--color-text-primary)",
      }}
    >
      <div className="max-w-2xl mx-auto w-full p-6 space-y-6">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <MonitorSmartphone size={20} />
          <h1 className="text-lg font-semibold">Remote Connect</h1>

          {/* Status badge */}
          <div
            className={cn(
              "ml-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
              status.running
                ? "bg-success/10 text-success"
                : "bg-muted/50 text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                status.running ? "bg-success animate-pulse" : "bg-muted-foreground",
              )}
            />
            {status.running ? "Running" : "Stopped"}
          </div>
        </div>

        {error && (
          <div className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-xs text-error">
            {error}
          </div>
        )}

        {/* Server toggle */}
        <div
          className="flex items-center justify-between rounded-lg border p-4"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-3">
            {status.running ? (
              <Wifi size={18} className="text-success" />
            ) : (
              <WifiOff size={18} className="text-muted-foreground" />
            )}
            <div>
              <div className="text-sm font-medium">
                Remote Server
              </div>
              <div className="text-xs text-muted-foreground">
                {status.running
                  ? "Server is running and accepting connections"
                  : "Server is stopped"}
              </div>
            </div>
          </div>

          <button
            onClick={handleToggle}
            disabled={toggling}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium text-white transition-colors",
              "hover:opacity-90 disabled:opacity-50",
            )}
            style={{
              background: status.running
                ? "var(--color-error, #ef4444)"
                : "var(--color-brand)",
            }}
          >
            {toggling ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Power size={12} />
            )}
            {status.running ? "Stop" : "Start"}
          </button>
        </div>

        {/* QR Code + URL section */}
        {status.running && (
          <div
            className="rounded-lg border p-4 space-y-4"
            style={{ borderColor: "var(--color-border)" }}
          >
            <h2 className="text-sm font-medium">Connection</h2>

            {/* QR Code */}
            <QrPlaceholder url={status.url} />

            {/* Connection URL */}
            <div
              className="flex items-center gap-2 rounded-md border px-3 py-2"
              style={{ borderColor: "var(--color-border)" }}
            >
              <ExternalLink size={12} className="text-muted-foreground shrink-0" />
              <code className="flex-1 text-xs font-mono truncate">
                {status.url}
              </code>
              <button
                onClick={handleCopyUrl}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition-colors",
                  "hover:bg-accent/50",
                  urlCopied && "text-success",
                )}
              >
                <Copy size={10} />
                {urlCopied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {/* Connected devices */}
        <div
          className="rounded-lg border p-4 space-y-3"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Connected Devices</h2>
            <span className="text-xs text-muted-foreground">
              {status.connectedDevices.length} device{status.connectedDevices.length !== 1 ? "s" : ""}
            </span>
          </div>

          {status.connectedDevices.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
              No devices connected
            </div>
          ) : (
            <div className="space-y-2">
              {status.connectedDevices.map((device) => (
                <div
                  key={device.id}
                  className="flex items-center gap-3 rounded-md border px-3 py-2"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <MonitorSmartphone size={14} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{device.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {device.platform ?? "Unknown platform"}
                      {" · "}
                      Connected {new Date(device.connectedAt).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDisconnect(device.id)}
                    className="flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] text-error hover:bg-error/10 transition-colors shrink-0"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <Trash2 size={10} />
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
