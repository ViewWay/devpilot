import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as TerminalIcon, Plus, X, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { isTauriRuntime } from "../../lib/ipc";
import {
  ptyCreate,
  ptyWrite,
  ptyResize,
  ptyKill,
  listen,
  type PtyCreateResultIPC,
  type PtyOutputEventIPC,
  type PtyExitEventIPC,
} from "../../lib/ipc";
import { useUIStore } from "../../stores/uiStore";
import type { Terminal as XtermTerminal } from "@xterm/xterm";

// ── Demo mode data (browser fallback) ────────────────────────

interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
  /** Backend PTY session ID (set when using real PTY) */
  ptySessionId?: string;
}

const DEMO_COMMANDS: Record<string, string> = {
  ls: "Cargo.toml  src/  target/  docs/  package.json  tsconfig.json\nnode_modules/  .gitignore  README.md  index.html",
  pwd: "/home/user/devpilot",
  whoami: "developer",
  date: new Date().toString(),
  "uname -a": "Darwin DevPilot 24.4.0 arm64",
  "cargo --version": "cargo 1.82.0 (8f40fc1f3 2024-08-21)",
  "node --version": "v22.11.0",
  "rustc --version": "rustc 1.82.0 (f6e511eec 2024-10-15)",
  "git status":
    "On branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean",
  "git log --oneline -3":
    "a1b2c3d feat: add terminal panel\ne4f5g6h fix: streaming message rendering\n7i8j9k0 chore: update dependencies",
  "npm run build":
    "\x1b[32m> devpilot@0.1.0 build\x1b[0m\n> tsc -b && vite build\n\nvite v6.0.0 building for production...\n\u2713 2416 modules transformed.\ndist/index.html          0.45 kB │ gzip:  0.29 kB\ndist/assets/index.js    811.19 kB │ gzip: 248.87 kB\n\u2713 built in 388ms",
  "cargo build --release":
    "   Compiling devpilot-core v0.1.0\n   Compiling devpilot-llm v0.1.0\n   Compiling devpilot-tools v0.1.0\n   Compiling devpilot v0.1.0\n    Finished `release` profile [optimized] target(s) in 42.3s",
  clear: "__CLEAR__",
  help: `Available commands (demo mode):
  ls, pwd, whoami, date, uname -a
  cargo --version, rustc --version, node --version
  git status, git log --oneline -3
  npm run build, cargo build --release
  clear, help, echo <text>

  In production, this connects to a real PTY backend.`,
};

// ── xterm.js lazy loader ────────────────────────────────────

let xtermLoaded: {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  XTerm: typeof import("@xterm/xterm");
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  FitAddon: typeof import("@xterm/addon-fit");
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  WebLinksAddon: typeof import("@xterm/addon-web-links");
} | null = null;

async function loadXterm() {
  if (!xtermLoaded) {
    const [xMod, fMod, wMod] = await Promise.all([
      import("@xterm/xterm"),
      import("@xterm/addon-fit"),
      import("@xterm/addon-web-links"),
    ]);
    xtermLoaded = { XTerm: xMod, FitAddon: fMod, WebLinksAddon: wMod };
  }
  return xtermLoaded;
}

 
function writePrompt(term: XtermTerminal) {
  term.write("\x1b[32m\u276f\x1b[0m ");
}

// ── Base64 helpers ───────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Demo mode command processing ─────────────────────────────

 
async function processDemoCommand(
  term: XtermTerminal,
  cmd: string,
) {
  if (cmd.startsWith("echo ")) {
    term.writeln(cmd.slice(5));
    writePrompt(term);
    return;
  }
  const output = DEMO_COMMANDS[cmd];
  if (output === "__CLEAR__") {
    term.clear();
    writePrompt(term);
  } else if (output) {
    const lines = output.split("\n");
    let i = 0;
    const interval = setInterval(() => {
      if (i < lines.length) {
        term.writeln(lines[i]!);
        i++;
      } else {
        clearInterval(interval);
        writePrompt(term);
      }
    }, 15);
  } else {
    term.writeln(`\x1b[31mbash: ${cmd}: command not found\x1b[0m`);
    writePrompt(term);
  }
}

// ── PTY-backed tab manager ──────────────────────────────────

function usePtyTerminal(
  _termContainerRef: React.RefObject<HTMLDivElement | null>,
   
  termRef: React.MutableRefObject<XtermTerminal | null>,
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  _fitAddonRef: React.MutableRefObject<import("@xterm/addon-fit").FitAddon | null>,
  activeTab: TerminalTab | undefined,
  onPtyCreated: (tabId: string, ptySessionId: string) => void,
) {
  const ptySessionRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void)[]>([]);

  // Create a PTY session for the active tab
  const createPty = useCallback(
    async (tabId: string) => {
      const term = termRef.current;
      if (!term || !isTauriRuntime()) {return;}

      const workingDir =
        useUIStore.getState().workingDir || undefined;
      const cols = term.cols;
      const rows = term.rows;

      try {
        const result: PtyCreateResultIPC = await ptyCreate({
          workingDir,
          cols,
          rows,
        });
        ptySessionRef.current = result.sessionId;
        onPtyCreated(tabId, result.sessionId);
      } catch (err) {
        term.writeln(
          `\x1b[31mPTY error: ${err instanceof Error ? err.message : String(err)}\x1b[0m`,
        );
      }
    },
    [termRef, onPtyCreated],
  );

  // Listen for PTY output events
  useEffect(() => {
    if (!isTauriRuntime() || !termRef.current) {return;}

    const term = termRef.current;

    const setup = async () => {
      const unlistenOutput = await listen<PtyOutputEventIPC>(
        "pty-output",
        (payload) => {
          if (
            ptySessionRef.current &&
            payload.sessionId === ptySessionRef.current
          ) {
            const bytes = base64ToBytes(payload.data);
            const decoder = new TextDecoder();
            term.write(decoder.decode(bytes));
          }
        },
      );

      const unlistenExit = await listen<PtyExitEventIPC>(
        "pty-exit",
        (payload) => {
          if (
            ptySessionRef.current &&
            payload.sessionId === ptySessionRef.current
          ) {
            term.writeln(
              `\x1b[90m[Process exited with code ${payload.exitCode}]\x1b[0m`,
            );
            ptySessionRef.current = null;
            writePrompt(term);
          }
        },
      );

      unlistenRef.current = [unlistenOutput, unlistenExit];
    };

    setup();

    return () => {
      unlistenRef.current.forEach((fn) => fn());
      unlistenRef.current = [];
    };
  }, [termRef]);

  // When active tab changes, connect PTY or create new one
  useEffect(() => {
    if (!isTauriRuntime()) {return;}
    if (!activeTab) {return;}

    if (activeTab.ptySessionId) {
      // Reconnect to existing session
      ptySessionRef.current = activeTab.ptySessionId;
    } else {
      // Create new PTY session
      ptySessionRef.current = null;
      createPty(activeTab.id);
    }

    return () => {
      // Don't kill PTY on tab switch — just disconnect listener
      ptySessionRef.current = null;
    };
  }, [activeTab, createPty]);

  // Send data to PTY
  const sendToPty = useCallback(
    (data: string) => {
      if (!ptySessionRef.current) {return;}
      const encoder = new TextEncoder();
      const bytes = encoder.encode(data);
      const b64 = bytesToBase64(bytes);
      ptyWrite(ptySessionRef.current, b64).catch(() => {
        /* ignore write errors */
      });
    },
    [],
  );

  // Resize PTY
  const resizePty = useCallback(
    (cols: number, rows: number) => {
      if (!ptySessionRef.current) {return;}
      ptyResize(ptySessionRef.current, cols, rows).catch(() => {
        /* ignore */
      });
    },
    [],
  );

  // Kill PTY
  const killPty = useCallback(async (sessionId: string) => {
    await ptyKill(sessionId).catch(() => {
      /* ignore */
    });
  }, []);

  return { sendToPty, resizePty, killPty };
}

// ── Main TerminalPanel Component ─────────────────────────────

export function TerminalPanel() {
  const termContainerRef = useRef<HTMLDivElement>(null);
   
  const termRef = useRef<XtermTerminal | null>(null);
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: "tab-1", title: "bash", cwd: "~" },
  ]);
  const [activeTabId, setActiveTabId] = useState("tab-1");

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handlePtyCreated = useCallback(
    (tabId: string, ptySessionId: string) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === tabId ? { ...t, ptySessionId } : t,
        ),
      );
    },
    [],
  );

  const { sendToPty, resizePty, killPty } = usePtyTerminal(
    termContainerRef,
    termRef,
    fitAddonRef,
    activeTab,
    handlePtyCreated,
  );

  // Initialize xterm.js terminal
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;

    (async () => {
      if (cancelled) {return;}
      const { XTerm, FitAddon, WebLinksAddon } = await loadXterm();
      if (cancelled || !termContainerRef.current) {return;}

      // Read theme colors from CSS variables
      const cs = getComputedStyle(document.documentElement);
      const themeBg =
        cs.getPropertyValue("--background").trim() || "#1a1b26";
      const isDark = themeBg.includes("0.1");

      const term = new XTerm.Terminal({
        theme: {
          background: isDark ? "#1a1b26" : "#fafafa",
          foreground: isDark ? "#c0caf5" : "#383a42",
          cursor: isDark ? "#c0caf5" : "#383a42",
          cursorAccent: isDark ? "#1a1b26" : "#fafafa",
          selectionBackground: isDark ? "#33467c" : "#add6ff",
          black: isDark ? "#15161e" : "#383a42",
          red: isDark ? "#f7768e" : "#e45649",
          green: isDark ? "#9ece6a" : "#50a14f",
          yellow: isDark ? "#e0af68" : "#c18401",
          blue: isDark ? "#7aa2f7" : "#4078f2",
          magenta: isDark ? "#bb9af7" : "#a626a4",
          cyan: isDark ? "#7dcfff" : "#0184bc",
          white: isDark ? "#a9b1d6" : "#a0a1a7",
          brightBlack: isDark ? "#414868" : "#4f4f4f",
          brightRed: isDark ? "#f7768e" : "#e45649",
          brightGreen: isDark ? "#9ece6a" : "#50a14f",
          brightYellow: isDark ? "#e0af68" : "#c18401",
          brightBlue: isDark ? "#7aa2f7" : "#4078f2",
          brightMagenta: isDark ? "#bb9af7" : "#a626a4",
          brightCyan: isDark ? "#7dcfff" : "#0184bc",
          brightWhite: isDark ? "#c0caf5" : "#383a42",
        },
        fontFamily:
          "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: true,
        cursorStyle: "bar",
        allowProposedApi: true,
      });

      const fit = new FitAddon.FitAddon();
      const webLinks = new WebLinksAddon.WebLinksAddon();
      term.loadAddon(fit);
      term.loadAddon(webLinks);
      term.open(termContainerRef.current);
      fit.fit();

      if (isTauriRuntime()) {
        term.writeln(
          "\x1b[1;34m  DevPilot Terminal\x1b[0m \x1b[90m(PTY mode)\x1b[0m",
        );
        const workDir = useUIStore.getState().workingDir;
        if (workDir) {
          term.writeln(`\x1b[90m  cwd: ${workDir}\x1b[0m`);
        }
        term.writeln(
          "\x1b[90m  Interactive shell via embedded PTY.\x1b[0m",
        );
      } else {
        term.writeln(
          "\x1b[1;34m  DevPilot Terminal\x1b[0m \x1b[90m(v0.5.5)\x1b[0m",
        );
        term.writeln(
          "\x1b[90m  Type 'help' for available commands.\x1b[0m",
        );
      }
      term.writeln("");
      writePrompt(term);

      // Input handling
      let currentLine = "";
      term.onData((data) => {
        if (isTauriRuntime()) {
          // In PTY mode, forward ALL data directly to the PTY
          sendToPty(data);
          return;
        }

        // Demo mode: line-by-line command processing
        if (data === "\r") {
          term.writeln("");
          const cmd = currentLine.trim();
          currentLine = "";
          if (cmd === "clear") {
            term.clear();
            writePrompt(term);
          } else if (cmd) {
            processDemoCommand(term, cmd);
          } else {
            writePrompt(term);
          }
        } else if (data === "\x7f") {
          if (currentLine.length > 0) {
            currentLine = currentLine.slice(0, -1);
            term.write("\b \b");
          }
        } else if (data === "\x03") {
          term.writeln("^C");
          currentLine = "";
          writePrompt(term);
        } else if (data === "\t") {
          const partial = currentLine.split(" ").pop() || "";
          const matches = Object.keys(DEMO_COMMANDS).filter((c) =>
            c.startsWith(partial),
          );
          if (matches.length === 1) {
            const prefix = currentLine.split(" ").slice(0, -1).join(" ");
            currentLine = prefix
              ? `${prefix} ${matches[0]}`
              : matches[0]!;
            term.write(matches[0]!.slice(partial.length));
          } else if (matches.length > 1) {
            term.writeln("");
            term.writeln(matches.join("  "));
            writePrompt(term);
            term.write(currentLine);
          }
        } else if (data >= " ") {
          currentLine += data;
          term.write(data);
        }
      });

      termRef.current = term;
      fitAddonRef.current = fit;

      // Auto-resize + forward to PTY
      observer = new ResizeObserver(() => {
        try {
          fit.fit();
          if (isTauriRuntime()) {
            resizePty(term.cols, term.rows);
          }
        } catch {
          /* ignore */
        }
      });
      observer.observe(termContainerRef.current);
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      termRef.current?.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFocus = useCallback(() => {
    termRef.current?.focus();
  }, []);

  const addTab = () => {
    const id = `tab-${Date.now()}`;
    setTabs((prev) => [...prev, { id, title: "bash", cwd: "~" }]);
    setActiveTabId(id);
  };

  const closeTab = (tab: TerminalTab) => {
    // Kill PTY session if it exists
    if (tab.ptySessionId) {
      killPty(tab.ptySessionId);
    }

    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tab.id);
      if (next.length === 0) {
        const newId = `tab-${Date.now()}`;
        return [{ id: newId, title: "bash", cwd: "~" }];
      }
      return next;
    });
    setActiveTabId((cur) => {
      if (cur === tab.id) {
        const remaining = tabs.filter((t) => t.id !== tab.id);
        return remaining[0]?.id ?? `tab-${Date.now()}`;
      }
      return cur;
    });
  };

  const clearTerminal = () => {
    if (termRef.current) {
      termRef.current.clear();
      if (!isTauriRuntime()) {
        writePrompt(termRef.current);
      }
    }
  };

  return (
    <div className="flex h-full flex-col bg-card">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border/50 bg-muted/50 px-2 py-1">
        <TerminalIcon size={12} className="text-muted-foreground ml-1" />
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition-colors",
              tab.id === activeTabId
                ? "bg-card text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                tab.ptySessionId
                  ? "bg-success/70"
                  : "bg-warning/70",
              )}
            />
            <span>{tab.title}</span>
            <span className="text-[10px] text-muted-foreground/60">
              {tab.cwd}
            </span>
            {tabs.length > 1 && (
              <X
                size={10}
                className="ml-0.5 text-muted-foreground/50 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab);
                }}
              />
            )}
          </button>
        ))}
        <button
          onClick={addTab}
          className="flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus size={12} />
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={clearTerminal}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {/* Terminal container */}
      <div
        ref={termContainerRef}
        className="flex-1 cursor-text"
        onClick={handleFocus}
        style={{ minHeight: 0 }}
      />
    </div>
  );
}
