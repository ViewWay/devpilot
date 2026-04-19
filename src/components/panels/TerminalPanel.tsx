import { useEffect, useRef, useState, useCallback } from "react";
import { Terminal as TerminalIcon, Plus, X, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { isTauriRuntime, invoke } from "../../lib/ipc";
import { useUIStore } from "../../stores/uiStore";

interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
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
  "git status": "On branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean",
  "git log --oneline -3": "a1b2c3d feat: add terminal panel\ne4f5g6h fix: streaming message rendering\n7i8j9k0 chore: update dependencies",
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

  In production, this will connect to a real PTY backend.`,
};

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

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
function writePrompt(term: import("@xterm/xterm").Terminal) {
  term.write("\x1b[32m\u276f\x1b[0m ");
}

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
async function processCommand(term: import("@xterm/xterm").Terminal, cmd: string) {
  if (isTauriRuntime()) {
    try {
      const workingDir = useUIStore.getState().workingDir || undefined;
      const result = await invoke<{
        stdout: string;
        stderr: string;
        exitCode: number | null;
        denied: boolean;
        denialReason: string | null;
        durationMs: number;
      }>("sandbox_execute", {
        request: { command: cmd, workingDir, policy: "default" },
      });
      if (result.denied) {
        term.writeln(`\x1b[31mDenied: ${result.denialReason ?? "policy restriction"}\x1b[0m`);
      } else {
        if (result.stdout) {
          for (const line of result.stdout.split("\n")) {
            term.writeln(line);
          }
        }
        if (result.stderr) {
          for (const line of result.stderr.split("\n")) {
            term.writeln(`\x1b[31m${line}\x1b[0m`);
          }
        }
        if (result.exitCode !== 0 && result.exitCode !== null) {
          term.writeln(`\x1b[33mexit code: ${result.exitCode}\x1b[0m`);
        }
      }
    } catch (err) {
      term.writeln(`\x1b[31mError: ${err instanceof Error ? err.message : String(err)}\x1b[0m`);
    }
    writePrompt(term);
    return;
  }

  // Demo mode fallback
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

export function TerminalPanel() {
  const termContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const fitAddonRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const [tabs, setTabs] = useState<TerminalTab[]>([
    { id: "tab-1", title: "bash", cwd: "~" },
  ]);
  const [activeTabId, setActiveTabId] = useState("tab-1");

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;

    (async () => {
      if (cancelled) {return;}
      const { XTerm, FitAddon, WebLinksAddon } = await loadXterm();
      if (cancelled || !termContainerRef.current) {return;}

      const term = new XTerm.Terminal({
        theme: {
          background: "#1a1b26",
          foreground: "#c0caf5",
          cursor: "#c0caf5",
          cursorAccent: "#1a1b26",
          selectionBackground: "#33467c",
          black: "#15161e",
          red: "#f7768e",
          green: "#9ece6a",
          yellow: "#e0af68",
          blue: "#7aa2f7",
          magenta: "#bb9af7",
          cyan: "#7dcfff",
          white: "#a9b1d6",
          brightBlack: "#414868",
          brightRed: "#f7768e",
          brightGreen: "#9ece6a",
          brightYellow: "#e0af68",
          brightBlue: "#7aa2f7",
          brightMagenta: "#bb9af7",
          brightCyan: "#7dcfff",
          brightWhite: "#c0caf5",
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
        const workDir = useUIStore.getState().workingDir;
        term.writeln("\x1b[1;34m  DevPilot Terminal\x1b[0m \x1b[90m(sandbox mode)\x1b[0m");
        if (workDir) {
          term.writeln(`\x1b[90m  cwd: ${workDir}\x1b[0m`);
        }
        term.writeln("\x1b[90m  Commands run via sandbox_execute IPC.\x1b[0m");
      } else {
        term.writeln("\x1b[1;34m  DevPilot Terminal\x1b[0m \x1b[90m(v0.1.0 — demo mode)\x1b[0m");
        term.writeln("\x1b[90m  Type 'help' for available commands.\x1b[0m");
      }
      term.writeln("");
      writePrompt(term);

      let currentLine = "";
      term.onData((data) => {
        if (data === "\r") {
          term.writeln("");
          const cmd = currentLine.trim();
          currentLine = "";
          if (cmd === "clear") {
            term.clear();
            writePrompt(term);
          } else if (cmd) {
            processCommand(term, cmd);
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
            currentLine = prefix ? `${prefix} ${matches[0]}` : matches[0]!;
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

      observer = new ResizeObserver(() => {
        try { fit.fit(); } catch { /* ignore */ }
      });
      observer.observe(termContainerRef.current);
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      termRef.current?.dispose();
      termRef.current = null;
    };
  }, []);

  const handleFocus = useCallback(() => {
    termRef.current?.focus();
  }, []);

  const addTab = () => {
    const id = `tab-${Date.now()}`;
    setTabs((prev) => [...prev, { id, title: "bash", cwd: "~" }]);
    setActiveTabId(id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (next.length === 0) {
        const newId = `tab-${Date.now()}`;
        return [{ id: newId, title: "bash", cwd: "~" }];
      }
      return next;
    });
    setActiveTabId((cur) => {
      if (cur === id) {
        const remaining = tabs.filter((t) => t.id !== id);
        return remaining[0]?.id ?? `tab-${Date.now()}`;
      }
      return cur;
    });
  };

  const clearTerminal = () => {
    if (termRef.current) {
      termRef.current.clear();
      writePrompt(termRef.current);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#1a1b26]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border/50 bg-[#16161e] px-2 py-1">
        <TerminalIcon size={12} className="text-muted-foreground ml-1" />
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition-colors",
              tab.id === activeTabId
                ? "bg-[#1a1b26] text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-[#1a1b26]/50",
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-green-500/70" />
            <span>{tab.title}</span>
            <span className="text-[10px] text-muted-foreground/60">{tab.cwd}</span>
            {tabs.length > 1 && (
              <X
                size={10}
                className="ml-0.5 text-muted-foreground/50 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
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
