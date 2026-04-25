/**
 * ArtifactRenderer — builds self-contained HTML documents for artifact previews.
 *
 * Ported from claude-rust-desktop's reference implementation.  This is pure
 * utility logic with no framework dependencies; it produces HTML strings that
 * can be loaded into a sandboxed <iframe>.
 *
 * Exports:
 *   - buildArtifactHtml(content, type)  → self-contained HTML string
 *   - preprocessReactCode(code)          → stripped code + component name
 *   - loadArtifactCode(codeFile)         → fetch from ./artifacts/code/
 */

// ── Constants ──────────────────────────────────────────────────

const REACT_CDN = "https://unpkg.com/react@18/umd/react.development.js";
const REACT_DOM_CDN = "https://unpkg.com/react-dom@18/umd/react-dom.development.js";
const BABEL_CDN = "https://unpkg.com/@babel/standalone/babel.min.js";
const TAILWIND_CDN = "https://cdn.tailwindcss.com";

// Closing script tag split to avoid premature termination in template literals.
const SCRIPT_CLOSE = "<" + "/script>";

// ── preprocessReactCode ────────────────────────────────────────

/**
 * Strip import statements, detect the main component name, and generate
 * stubs for any lucide-react icons referenced in the code.
 */
export function preprocessReactCode(code: string): {
  code: string;
  componentName: string;
} {
  // 1. Remove all import lines
  const lines = code.split("\n");
  const kept: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith("import ")) {
      continue;
    }
    kept.push(line);
  }

  let stripped = kept.join("\n");

  // 2. Detect the main component name — look for `function Xxx` or `const Xxx =`
  let componentName = "App";

  // function Xxx(
  const funcMatch = stripped.match(
    /(?:function|const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*(?:\(|=\s*\(?(?:\{|\()|\s*=>)/,
  );
  if (funcMatch?.[1]) {
    componentName = funcMatch[1];
  }

  // 3. Collect all lucide-react icon names referenced in the code
  const lucideIcons = new Set<string>();
  const iconPattern = /\b([A-Z][A-Za-z0-9]*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = iconPattern.exec(stripped)) !== null) {
    const name = match[1];
    if (!name) {
      continue;
    }
    // Heuristic: if the PascalCase name looks like a lucide icon usage
    // (appears as a JSX tag or reference), keep it as a candidate.
    if (
      !["React", "ReactDOM", "Babel", "App", componentName].includes(name) &&
      !name.endsWith("Context") &&
      !name.endsWith("Provider") &&
      !name.endsWith("Ref")
    ) {
      // Check if it's used like a component: <IconName or <IconName,
      if (new RegExp(`<${name}[\\s/>]`).test(stripped)) {
        lucideIcons.add(name);
      }
    }
  }

  // 4. Generate icon stubs
  const iconStubs = Array.from(lucideIcons)
    .map(
      (name) =>
        `const ${name} = (props) => React.createElement('svg', { ...props, xmlns: 'http://www.w3.org/2000/svg', width: props?.size || 24, height: props?.size || 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }, React.createElement('circle', { cx: '12', cy: '12', r: '10' }));`,
    )
    .join("\n");

  // 5. Recharts mock — lightweight stubs so imports don't blow up
  const rechartsMock = [
    "const { ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area } = (() => {",
    "  const mk = (tag) => (props) => React.createElement(tag, props, props?.children);",
    "  return {",
    "    ResponsiveContainer: mk('div'),",
    "    LineChart: mk('svg'),",
    "    Line: mk('line'),",
    "    BarChart: mk('svg'),",
    "    Bar: mk('rect'),",
    "    PieChart: mk('svg'),",
    "    Pie: mk('path'),",
    "    Cell: mk('g'),",
    "    XAxis: mk('g'),",
    "    YAxis: mk('g'),",
    "    CartesianGrid: mk('g'),",
    "    Tooltip: mk('div'),",
    "    Legend: mk('div'),",
    "    AreaChart: mk('svg'),",
    "    Area: mk('path'),",
    "  };",
    "})();",
  ].join("\n");

  const prefix = [iconStubs, rechartsMock].filter(Boolean).join("\n");
  stripped = `${prefix}\n${stripped}`;

  return { code: stripped, componentName };
}

// ── buildArtifactHtml ──────────────────────────────────────────

/**
 * Build a self-contained HTML document string for a given artifact.
 *
 * - `type = "text/html"`               → wraps in full HTML doc if needed
 * - `type = "application/vnd.ant.react"` → wraps with React 18 + Babel +
 *                                          Tailwind CDN runtime
 */
export function buildArtifactHtml(content: string, type: string): string {
  if (type === "application/vnd.ant.react") {
    return buildReactArtifactHtml(content);
  }

  // Default: treat as HTML
  return buildHtmlArtifactHtml(content);
}

function buildHtmlArtifactHtml(content: string): string {
  const trimmed = content.trim();

  // Already a full document?
  if (trimmed.toLowerCase().startsWith("<!doctype") || trimmed.toLowerCase().startsWith("<html")) {
    return trimmed;
  }

  // Wrap in a minimal document
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="${TAILWIND_CDN}">${SCRIPT_CLOSE}
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
${trimmed}
</body>
</html>`;
}

function buildReactArtifactHtml(content: string): string {
  const { code, componentName } = preprocessReactCode(content);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="${REACT_CDN}">${SCRIPT_CLOSE}
  <script src="${REACT_DOM_CDN}">${SCRIPT_CLOSE}
  <script src="${BABEL_CDN}">${SCRIPT_CLOSE}
  <script src="${TAILWIND_CDN}">${SCRIPT_CLOSE}
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; }
    #root { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-type="module">
${code}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(${componentName}));
  ${SCRIPT_CLOSE}
</body>
</html>`;
}

// ── loadArtifactCode ───────────────────────────────────────────

/**
 * Fetch an artifact code file from the static artifacts directory.
 * Returns null if the file cannot be loaded.
 */
export async function loadArtifactCode(
  codeFile: string,
): Promise<{ content: string; type: string; title: string } | null> {
  try {
    const url = `./artifacts/code/${codeFile}`;
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }

    const content = await res.text();

    // Infer type from extension
    const ext = codeFile.split(".").pop()?.toLowerCase() ?? "";
    let type = "text/html";
    if (ext === "jsx" || ext === "tsx") {
      type = "application/vnd.ant.react";
    }

    // Derive title from filename
    const title = codeFile
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    return { content, type, title };
  } catch {
    return null;
  }
}
