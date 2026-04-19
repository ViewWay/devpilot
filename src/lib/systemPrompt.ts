/**
 * Default system prompt for DevPilot AI coding assistant.
 *
 * This is prepended to all chat requests unless overridden.
 * It instructs the model about available tools and best practices.
 */

import { invoke } from "./ipc";

// ── Types ──────────────────────────────────────────────────────

/** Result from loading persona files (mirrors Rust PersonaFilesResult). */
export interface PersonaFilesResult {
  soul: string;
  user: string;
  memory: string;
}

/** A single daily memory entry (mirrors Rust DailyMemory). */
export interface DailyMemory {
  date: string;
  content: string;
}

/** A memory search hit (mirrors Rust MemorySearchResult). */
export interface MemorySearchResult {
  date: string;
  snippet: string;
  matchCount: number;
}

// ── Default Prompt ─────────────────────────────────────────────

export const DEFAULT_SYSTEM_PROMPT = `You are DevPilot, an intelligent AI coding assistant. You help users write, edit, debug, and understand code.

## Available Tools

You have access to these tools. Use them proactively to accomplish tasks:

### File Operations
- **file_read**: Read file contents with line numbers. Supports pagination with offset/limit.
- **file_write**: Create or overwrite files. Creates parent directories automatically.
- **apply_patch**: Make targeted edits to existing files using find-and-replace.
- **file_search**: Search file contents by regex or find files by name pattern.

### Directory & Discovery
- **list_directory**: List files and directories. Supports recursive traversal, hidden file display, and file sizes.
- **glob**: Find files by pattern matching (e.g., \`**/*.rs\`, \`src/**/*.tsx\`).

### Execution
- **shell_exec**: Run shell commands. Use for builds, tests, git operations, package management.
- **web_fetch**: Fetch and extract text content from URLs.

## Guidelines

1. **Explore before editing**: Use \`file_read\`, \`list_directory\`, and \`glob\` to understand the codebase before making changes.
2. **Make targeted edits**: Prefer \`apply_patch\` over \`file_write\` for existing files. Only rewrite entire files when creating new ones.
3. **Verify changes**: After editing, run relevant tests or builds to confirm correctness.
4. **Git discipline**: Use conventional commits (feat:, fix:, chore:, etc.). Commit after completing logical units of work.
5. **Be concise**: Don't repeat information the user already knows. Focus on what's new or changed.
6. **Explain trade-offs**: When multiple approaches exist, briefly explain your reasoning for the chosen approach.`;

// ── Persona Loading ────────────────────────────────────────────

/**
 * Cached persona data so we don't hit the filesystem on every request.
 * Invalidated when the workspace changes.
 */
let cachedPersona: PersonaFilesResult | null = null;
let cachedWorkspaceDir: string | null = null;

/**
 * Load persona files from the workspace's `.devpilot/` directory via IPC.
 *
 * Results are cached per workspace directory to avoid redundant IPC calls.
 * Pass `forceRefresh: true` to bust the cache.
 */
export async function loadPersonaIntoPrompt(
  workspaceDir: string,
  forceRefresh = false,
): Promise<PersonaFilesResult> {
  if (!forceRefresh && cachedPersona && cachedWorkspaceDir === workspaceDir) {
    return cachedPersona;
  }

  const result = await invoke<PersonaFilesResult>("load_persona_files_cmd", {
    workspaceDir,
  });

  cachedPersona = result;
  cachedWorkspaceDir = workspaceDir;
  return result;
}

/**
 * Search daily memories via IPC.
 */
export async function searchDailyMemories(
  dataDir: string,
  query: string,
): Promise<MemorySearchResult[]> {
  return invoke<MemorySearchResult[]>("search_memories_cmd", {
    dataDir,
    query,
  });
}

/**
 * List recent daily memories via IPC.
 */
export async function listRecentMemories(
  dataDir: string,
  limit?: number,
): Promise<DailyMemory[]> {
  return invoke<DailyMemory[]>("list_daily_memories_cmd", {
    dataDir,
    limit: limit ?? null,
  });
}

/**
 * Invalidate the persona cache (e.g., after a file save).
 */
export function invalidatePersonaCache(): void {
  cachedPersona = null;
  cachedWorkspaceDir = null;
}

// ── Prompt Assembly ────────────────────────────────────────────

/**
 * Build the full system prompt by combining:
 *
 * 1. The default tool-based prompt
 * 2. SOUL.md — agent personality
 * 3. USER.md — user preferences & project context
 * 4. MEMORY.md — long-term facts
 * 5. Any user-configured custom prompt
 *
 * Each section is only included when non-empty.
 */
export function buildSystemPrompt(
  customPrompt?: string,
  persona?: PersonaFilesResult,
): string {
  const parts: string[] = [DEFAULT_SYSTEM_PROMPT];

  if (persona) {
    // SOUL.md — agent personality & behavioral rules
    if (persona.soul.trim()) {
      parts.push(
        "## Agent Personality (SOUL.md)\n\n" + persona.soul.trim(),
      );
    }

    // USER.md — user preferences & project context
    if (persona.user.trim()) {
      parts.push(
        "## User Context (USER.md)\n\n" + persona.user.trim(),
      );
    }

    // MEMORY.md — long-term facts
    if (persona.memory.trim()) {
      parts.push(
        "## Long-term Memory (MEMORY.md)\n\n" + persona.memory.trim(),
      );
    }
  }

  if (customPrompt?.trim()) {
    parts.push("## Additional Instructions\n\n" + customPrompt.trim());
  }

  return parts.join("\n\n");
}

/**
 * Convenience: load persona files from the workspace and build the full
 * system prompt in one call.
 */
export async function buildSystemPromptWithPersona(
  workspaceDir: string,
  customPrompt?: string,
): Promise<string> {
  const persona = await loadPersonaIntoPrompt(workspaceDir);
  return buildSystemPrompt(customPrompt, persona);
}
