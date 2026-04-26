# DevPilot Phase 7: Feature Enhancement Specifications

> Based on comparative analysis with claude-rust-desktop (v1.6.12)
> Date: 2026-04-26

## Overview

Phase 7 focuses on closing feature gaps identified against claude-rust-desktop while maintaining DevPilot's architectural advantages. 7 features across 3 priority tiers.

---

## F7.1: LaTeX/KaTeX Rendering (P0, Low Effort)

### Requirement

Render mathematical formulas in markdown messages using KaTeX.

### User Stories

- As a user, I want to see `$E=mc^2$` rendered as inline math
- As a user, I want to see `$$\sum_{i=1}^{n} x_i$$` rendered as block math
- Formulas should support both light and dark themes

### Technical Approach

- Add `remark-math` + `rehype-katex` to remarkPlugins/rehypePlugins in MarkdownRenderer
- Add KaTeX CSS import
- Add `normalizeMathBlocks()` preprocessor for edge-case $$ blocks
- No backend changes needed

### Acceptance Criteria

- [ ] Inline `$...$` math renders correctly
- [ ] Block `$$...$$` math renders correctly with centered alignment
- [ ] Dark/light theme support
- [ ] Graceful fallback for malformed LaTeX (show raw text, no crash)
- [ ] No regression in existing markdown rendering

---

## F7.2: Citation & Source References (P0, Medium Effort)

### Requirement

Display citation sources referenced by LLM responses with expandable source list.

### User Stories

- As a user, I want to see citation badges [1][2] inline in assistant messages
- As a user, I want to click/hover a citation to see the source title, URL, and excerpt
- As a user, I want to see a collapsible "Sources" section at the bottom of messages

### Technical Approach

- Add `CitationSource` type to `devpilot-protocol` (index, title, url, snippet)
- Add `citations` field to `Message` type
- Parse `<cite index="N">` tags in markdown output
- Add `CitationBadge` component (inline) and `SourcesList` component (collapsible footer)
- Add `stream-citations` event for streaming citation delivery
- Strip `<cite>` tags during final content storage

### Acceptance Criteria

- [ ] Citation badges render inline with index number
- [ ] Hover/click shows source tooltip with title/URL/snippet
- [ ] Collapsible sources section at message bottom
- [ ] Works with both streaming and non-streaming messages
- [ ] No citation tags leak into stored message content

---

## F7.3: Context Window Monitor (P0, Low Effort)

### Requirement

Show real-time context window usage per session with visual indicator.

### User Stories

- As a user, I want to see how much of the context window I've used (e.g., "45k/200k tokens")
- As a user, I want a visual progress bar that changes color as context fills up
- As a user, I want to know when I should compact my conversation

### Technical Approach

- Add `get_context_size` Tauri IPC command returning `{ tokens: u64, limit: u64 }`
- Add `ContextSizeBar` component to chat header/footer area
- Color coding: green (<50%), yellow (50-80%), red (>80%)
- Call on each stream-done event + periodically during idle
- Use existing token counting from `devpilot-llm` pricing module

### Acceptance Criteria

- [ ] Context size bar visible in session panel header
- [ ] Updates after each message exchange
- [ ] Color transitions at 50% and 80% thresholds
- [ ] Compact suggestion toast when >80%
- [ ] Per-session tracking

---

## F7.4: Document Preview (P1, Medium Effort)

### Requirement

Preview PDF, DOCX, and PPTX files inline within the app.

### User Stories

- As a user, I want to click a PDF attachment and see it rendered inline
- As a user, I want to preview DOCX files without leaving the app
- As a user, I want to preview PPTX slides inline

### Technical Approach

- Add `pdfjs-dist` for PDF rendering with canvas-based page display
- Add `docx-preview` for DOCX rendering
- Add `PPTX preview via JSZip + slide XML parsing (or slidev-renderer)`
- Create `DocumentPreviewModal` component with page navigation
- Integrate with file attachment system and file tree

### Acceptance Criteria

- [ ] PDF preview with page-by-page navigation
- [ ] DOCX preview with formatted text and images
- [ ] PPTX preview with slide thumbnails
- [ ] Full-screen toggle for all document types
- [ ] Loading states for large documents

---

## F7.5: Voice Input (P1, Low Effort)

### Requirement

Add voice-to-text input capability using Web Speech API.

### User Stories

- As a user, I want to click a mic button and dictate my message
- As a user, I want to see real-time transcription as I speak
- As a user, I want the microphone to auto-stop after silence

### Technical Approach

- Use browser-native `SpeechRecognition` API (webkitSpeechRecognition fallback)
- Add `VoiceInput` component with mic toggle button in MessageInput
- Real-time transcript display with interim results
- Auto-stop after configurable silence timeout (3s default)
- Append final transcript to message input field
- Language auto-detect from i18n locale setting

### Acceptance Criteria

- [ ] Mic button in input bar toggles voice recognition
- [ ] Real-time transcript appears above input during recording
- [ ] Auto-stop after 3s silence
- [ ] Final transcript inserted into message input
- [ ] Visual recording indicator (pulsing mic icon)
- [ ] Graceful fallback message if browser doesn't support Web Speech API

---

## F7.6: Artifact System (P1, High Effort)

### Requirement

Generate, preview, and manage code artifacts (HTML/React apps, SVGs, etc.) in a sandboxed environment.

### User Stories

- As a user, I want the LLM to generate runnable artifacts (web apps, diagrams, etc.)
- As a user, I want to preview artifacts inline in an iframe sandbox
- As a user, I want to browse all artifacts across sessions in a gallery
- As a user, I want to download/export artifacts as files

### Technical Approach

- Parse `<artifact>` or `<cp_artifact>` tags from LLM streaming output
- Add `Artifact` type: `{ id, sessionId, messageId, type, title, content, createdAt }`
- Add `devpilot-artifact` concepts in protocol layer (or extend existing)
- `ArtifactRenderer` builds sandboxed HTML via iframe srcdoc (existing `buildArtifactHtml`)
- `ArtifactPanel` sidebar for current session artifacts
- `ArtifactGallery` page for cross-session artifact browsing
- Download as HTML/ZIP functionality
- Backend: CRUD IPC commands + SQLite storage

### Acceptance Criteria

- [ ] Artifacts detected and rendered from LLM output during streaming
- [ ] Sandboxed iframe preview with security constraints
- [ ] Artifact panel in session sidebar
- [ ] Artifact gallery page with search/filter
- [ ] Download artifact as file
- [ ] Artifact persistence across sessions

---

## F7.7: Per-Tool Specialized Renderers (P1, Medium Effort)

### Requirement

Display tool execution results with tool-specific visual formatting.

### User Stories

- As a user, I want to see file edits as a proper diff view (not raw text)
- As a user, I want to see shell command output with terminal-like formatting
- As a user, I want to see file read results with line numbers and syntax highlighting
- As a user, I want to see file write results as a preview of the created file

### Technical Approach

- Extend `ToolCallView` with tool-type-specific rendering branches
- `EditToolView`: diff rendering using existing `DiffView` component
- `WriteToolView`: file preview with language detection
- `ReadToolView`: syntax-highlighted content with line numbers
- `BashToolView`: terminal-style output with monospace font
- `SearchToolView`: file list with match count badges
- Add tool-type-specific icons and color coding
- Parse tool name from `ToolCall.name` to select renderer

### Acceptance Criteria

- [ ] Each of the 7 tool types has a dedicated visual renderer
- [ ] Edit/patch operations show unified diff
- [ ] Shell output rendered with terminal aesthetics
- [ ] File operations show syntax-highlighted previews
- [ ] Duration, status badges, and expand/collapse for all tools
- [ ] Existing generic view as fallback for unknown tool types

---

## Implementation Order

```
Week 1: F7.1 (LaTeX) → F7.3 (Context Monitor) → F7.5 (Voice) → F7.7 (Tool Renderers)
Week 2: F7.2 (Citations) → F7.4 (Document Preview) → F7.6 (Artifacts)
```

## Non-Goals (Deferred to Phase 8)

- Admin management panel (requires backend infrastructure)
- API gateway / key pooling (requires proxy server)
- Claude Code CLI integration (requires external binary management)
- Mobile device connection (requires WebSocket server + mobile app)
- Skills marketplace (requires backend marketplace API)
- Browser-based Python execution (Pyodide heavy, marginal value)
