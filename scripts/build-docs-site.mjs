#!/usr/bin/env node
/**
 * GitHub Pages site builder for the create-cli skill.
 * Pure Node.js — zero external dependencies.
 * Reads docs/index.md → outputs dist/docs-site/index.html + llms.txt
 *
 * Inspired by the openclaw/gogcli docs site pattern.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
} from "fs";
import { join } from "path";

const OUT = join("dist", "docs-site");
mkdirSync(OUT, { recursive: true });

// ── Config ────────────────────────────────────────────────────────────────────

const SKILL_NAME = "create-cli";
const TAGLINE =
  "Scaffold a production-ready Go CLI project with a single command.";
const DESCRIPTION =
  "A skill for agents that scaffolds production-ready Go CLI projects: Cobra, Makefile, CI/CD, golangci-lint, lefthook git hooks, GitHub Pages docs site, goreleaser multi-platform releases, and Homebrew tap dispatch.";
const INVOKE = "/create-cli";
const REPO = "https://github.com/pavelsimo/create-cli";
const SITE_BASE = existsSync("docs/CNAME")
  ? `https://${readFileSync("docs/CNAME", "utf8").trim()}`
  : "https://pavelsimo.github.io/create-cli";

// ── Markdown parser ───────────────────────────────────────────────────────────

function escape(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Stash literal strings to prevent double-escaping during inline processing. */
function stash(str, store) {
  const id = `\x00${store.length}\x00`;
  store.push(str);
  return id;
}
function unstash(str, store) {
  return str.replace(/\x00(\d+)\x00/g, (_, i) => store[+i]);
}

function highlightBash(code) {
  const store = [];
  let s = escape(code);
  // strings
  s = s.replace(/"([^"\\]|\\.)*"/g, (m) =>
    stash(`<span class="hl-str">${m}</span>`, store)
  );
  s = s.replace(/'[^']*'/g, (m) =>
    stash(`<span class="hl-str">${m}</span>`, store)
  );
  // comments
  s = s.replace(/(#.*)$/gm, (m) =>
    stash(`<span class="hl-cmt">${m}</span>`, store)
  );
  // flags
  s = s.replace(/(--?[\w-]+)/g, `<span class="hl-flag">$1</span>`);
  // commands at line start
  s = s.replace(
    /^(\s*)([\w.-]+)/gm,
    (_, sp, cmd) =>
      `${sp}<span class="hl-cmd">${cmd}</span>`
  );
  return unstash(s, store);
}

function highlightBlock(lang, code) {
  if (lang === "bash" || lang === "sh" || lang === "zsh") {
    return highlightBash(code);
  }
  return escape(code);
}

function inlineHtml(text, store) {
  // inline code
  text = text.replace(/`([^`]+)`/g, (_, c) =>
    stash(`<code>${escape(c)}</code>`, store)
  );
  // bold + italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // links
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, label, href) =>
      stash(
        `<a href="${href}"${href.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${label}</a>`,
        store
      )
  );
  return text;
}

function md2html(src) {
  const lines = src.split("\n");
  const store = [];
  const out = [];
  let i = 0;
  let inPara = false;
  let inList = false;
  let inFence = false;
  let fenceLang = "";
  let fenceLines = [];

  function closePara() {
    if (inPara) {
      out.push("</p>");
      inPara = false;
    }
  }
  function closeList() {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  }

  // strip frontmatter
  if (lines[0] === "---") {
    i = 1;
    while (i < lines.length && lines[i] !== "---") i++;
    i++; // skip closing ---
  }

  for (; i < lines.length; i++) {
    const line = lines[i];

    // fenced code block
    if (line.startsWith("```")) {
      if (!inFence) {
        closePara();
        closeList();
        inFence = true;
        fenceLang = line.slice(3).trim();
        fenceLines = [];
        continue;
      } else {
        const highlighted = highlightBlock(fenceLang, fenceLines.join("\n"));
        const langClass = fenceLang ? ` class="language-${fenceLang}"` : "";
        out.push(
          `<div class="code-wrap"><pre><code${langClass}>${highlighted}</code></pre>` +
            `<button class="copy-btn" aria-label="Copy">Copy</button></div>`
        );
        inFence = false;
        fenceLines = [];
        continue;
      }
    }
    if (inFence) {
      fenceLines.push(line);
      continue;
    }

    // headings
    const hm = line.match(/^(#{1,4})\s+(.*)/);
    if (hm) {
      closePara();
      closeList();
      const level = hm[1].length;
      const text = inlineHtml(hm[2], store);
      const id = hm[2]
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-");
      out.push(
        `<h${level} id="${id}">${unstash(text, store)}</h${level}>`
      );
      continue;
    }

    // horizontal rule
    if (line.match(/^---+$/)) {
      closePara();
      closeList();
      out.push("<hr>");
      continue;
    }

    // table
    if (line.startsWith("|")) {
      closePara();
      closeList();
      const tableLines = [line];
      while (i + 1 < lines.length && lines[i + 1].startsWith("|")) {
        i++;
        tableLines.push(lines[i]);
      }
      // skip separator row
      const rows = tableLines.filter((r) => !r.match(/^\|[-| :]+\|$/));
      out.push('<table>');
      rows.forEach((row, ri) => {
        const cells = row.split("|").slice(1, -1);
        const tag = ri === 0 ? "th" : "td";
        out.push(
          "<tr>" +
            cells
              .map((c) => `<${tag}>${unstash(inlineHtml(c.trim(), store), store)}</${tag}>`)
              .join("") +
            "</tr>"
        );
      });
      out.push("</table>");
      continue;
    }

    // unordered list
    if (line.match(/^[-*]\s/)) {
      closePara();
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      const text = unstash(inlineHtml(line.replace(/^[-*]\s/, ""), store), store);
      out.push(`<li>${text}</li>`);
      continue;
    }

    // blank line
    if (line.trim() === "") {
      closePara();
      closeList();
      continue;
    }

    // paragraph text
    closeList();
    if (!inPara) {
      out.push("<p>");
      inPara = true;
    } else {
      out.push(" ");
    }
    out.push(unstash(inlineHtml(line, store), store));
  }

  closePara();
  closeList();
  return out.join("\n");
}

// ── HTML template ─────────────────────────────────────────────────────────────

function renderPage(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${SKILL_NAME} — ${TAGLINE}</title>
  <meta name="description" content="${DESCRIPTION}">
  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:title" content="${SKILL_NAME}">
  <meta property="og:description" content="${DESCRIPTION}">
  <meta property="og:url" content="${SITE_BASE}/">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${SKILL_NAME}">
  <meta name="twitter:description" content="${DESCRIPTION}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:        #0d1117;
      --surface:   #161b22;
      --border:    #21262d;
      --text:      #e6edf3;
      --muted:     #7d8590;
      --accent:    #58a6ff;
      --accent-2:  #3fb950;
      --danger:    #f85149;
      --code-bg:   #1f2937;
      --font-sans: system-ui, -apple-system, "Segoe UI", sans-serif;
      --font-mono: "JetBrains Mono", "SF Mono", "Fira Code", monospace;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font: 16px/1.75 var(--font-sans);
      min-height: 100vh;
    }

    /* ── Nav ─────────────────────────────────────────── */
    nav {
      position: sticky; top: 0; z-index: 20;
      background: rgba(13,17,23,.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: .75rem 2rem;
      display: flex; align-items: center; gap: 1.5rem;
    }
    nav .brand {
      font-weight: 700; font-size: 1.1rem;
      color: var(--text); text-decoration: none; letter-spacing: -.02em;
    }
    nav .brand span { color: var(--accent); }
    nav .spacer { flex: 1; }
    nav a.nav-link {
      color: var(--muted); text-decoration: none; font-size: .9rem;
    }
    nav a.nav-link:hover { color: var(--text); }
    nav .gh-btn {
      display: flex; align-items: center; gap: .4rem;
      background: var(--surface); border: 1px solid var(--border);
      color: var(--text); text-decoration: none;
      padding: .35rem .8rem; border-radius: 6px; font-size: .875rem;
      transition: border-color .15s;
    }
    nav .gh-btn:hover { border-color: var(--accent); }

    /* ── Hero ────────────────────────────────────────── */
    .hero {
      max-width: 860px; margin: 0 auto;
      padding: 5rem 2rem 3rem;
      text-align: center;
    }
    .hero .invoke-pill {
      display: inline-block;
      background: var(--code-bg); border: 1px solid var(--border);
      color: var(--accent); font-family: var(--font-mono); font-size: .9rem;
      padding: .3rem .9rem; border-radius: 999px; margin-bottom: 1.5rem;
      letter-spacing: .02em;
    }
    .hero h1 {
      font-size: clamp(2rem, 5vw, 3rem);
      font-weight: 800; letter-spacing: -.04em;
      line-height: 1.15; margin-bottom: 1rem;
    }
    .hero h1 em { color: var(--accent); font-style: normal; }
    .hero p.lead {
      font-size: 1.1rem; color: var(--muted);
      max-width: 560px; margin: 0 auto 2rem;
    }
    .hero-actions {
      display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;
      margin-bottom: 2.5rem;
    }
    .btn-primary {
      background: var(--accent); color: #0d1117;
      font-weight: 600; padding: .6rem 1.4rem;
      border-radius: 6px; text-decoration: none; font-size: .95rem;
      transition: opacity .15s;
    }
    .btn-primary:hover { opacity: .85; }
    .btn-outline {
      border: 1px solid var(--border); color: var(--text);
      padding: .6rem 1.4rem; border-radius: 6px;
      text-decoration: none; font-size: .95rem;
      transition: border-color .15s;
    }
    .btn-outline:hover { border-color: var(--accent); }
    .install-snippet {
      display: inline-flex; align-items: center; gap: .75rem;
      background: var(--surface); border: 1px solid var(--border);
      padding: .65rem 1.25rem; border-radius: 8px;
      font-family: var(--font-mono); font-size: .9rem; color: var(--text);
    }
    .install-snippet .prompt { color: var(--muted); }
    .install-snippet .cmd { color: var(--accent-2); }

    /* ── Content ─────────────────────────────────────── */
    .content {
      max-width: 860px; margin: 0 auto;
      padding: 0 2rem 6rem;
    }
    .section {
      margin-bottom: 3.5rem;
    }

    h2 {
      font-size: 1.35rem; font-weight: 700;
      border-bottom: 1px solid var(--border);
      padding-bottom: .5rem; margin-bottom: 1.25rem;
      scroll-margin-top: 80px;
    }
    h3 { font-size: 1.05rem; font-weight: 600; margin: 1.5rem 0 .6rem; }
    h4 { font-size: .95rem; font-weight: 600; margin: 1.25rem 0 .5rem; color: var(--muted); }

    p { margin-bottom: .85rem; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    code {
      background: var(--code-bg); border: 1px solid var(--border);
      padding: .15em .45em; border-radius: 4px;
      font-family: var(--font-mono); font-size: .875em;
    }
    .code-wrap {
      position: relative; margin: 1rem 0;
    }
    pre {
      background: var(--code-bg); border: 1px solid var(--border);
      border-radius: 8px; padding: 1.25rem 1.25rem 1.25rem 1.25rem;
      overflow-x: auto; font-family: var(--font-mono); font-size: .85rem;
      line-height: 1.6;
    }
    pre code { background: none; border: none; padding: 0; font-size: inherit; }
    .copy-btn {
      position: absolute; top: .6rem; right: .6rem;
      background: var(--surface); border: 1px solid var(--border);
      color: var(--muted); font-size: .75rem; padding: .25rem .6rem;
      border-radius: 4px; cursor: pointer; transition: color .15s, border-color .15s;
      font-family: var(--font-sans);
    }
    .copy-btn:hover { color: var(--text); border-color: var(--accent); }
    .copy-btn.copied { color: var(--accent-2); border-color: var(--accent-2); }

    /* syntax */
    .hl-cmd  { color: #79c0ff; }
    .hl-flag { color: #ffa657; }
    .hl-str  { color: #a5d6ff; }
    .hl-cmt  { color: #8b949e; font-style: italic; }

    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: .9rem; }
    th { background: var(--surface); text-align: left; padding: .55rem .85rem; border: 1px solid var(--border); font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
    td { padding: .55rem .85rem; border: 1px solid var(--border); vertical-align: top; }
    td code { font-size: .82em; }

    ul { padding-left: 1.4rem; margin-bottom: .85rem; }
    li { margin-bottom: .3rem; }
    hr { border: none; border-top: 1px solid var(--border); margin: 2.5rem 0; }

    /* ── Footer ──────────────────────────────────────── */
    footer {
      border-top: 1px solid var(--border);
      text-align: center; padding: 2rem;
      color: var(--muted); font-size: .85rem;
    }
    footer a { color: var(--muted); }
    footer a:hover { color: var(--text); }

    @media (max-width: 600px) {
      nav { padding: .75rem 1rem; gap: 1rem; }
      .hero { padding: 3rem 1rem 2rem; }
      .content { padding: 0 1rem 4rem; }
    }
  </style>
</head>
<body>

<nav>
  <a class="brand" href="/"><span>/</span>${SKILL_NAME}</a>
  <div class="spacer"></div>
  <a class="gh-btn" href="${REPO}" target="_blank" rel="noopener">
    <svg height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
    GitHub
  </a>
</nav>

<section class="hero">
  <div class="invoke-pill">${INVOKE}</div>
  <h1>Scaffold a <em>Go CLI</em><br>in one command.</h1>
  <p class="lead">${TAGLINE} Cobra, Makefile, CI/CD, linter, git hooks, GitHub Pages, goreleaser + Homebrew tap — wired together and pushed to GitHub.</p>
  <div class="hero-actions">
    <a class="btn-primary" href="#installation">Get started</a>
    <a class="btn-outline" href="${REPO}" target="_blank" rel="noopener">View on GitHub</a>
  </div>
  <div class="install-snippet">
    <span class="prompt">$</span>
    <span class="cmd">cp SKILL.md ~/.claude/commands/create-cli.md</span>
  </div>
</section>

<div class="content">
${bodyHtml}
</div>

<footer>
  <p>
    <a href="${REPO}">${SKILL_NAME}</a> ·
    MIT License ·
    Inspired by <a href="https://github.com/steipete/agent-scripts" target="_blank" rel="noopener">steipete/agent-scripts</a>
  </p>
</footer>

<script>
  // Copy buttons
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code = btn.previousElementSibling.innerText;
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
      });
    });
  });
</script>

</body>
</html>`;
}

// ── Build ─────────────────────────────────────────────────────────────────────

const src = readFileSync("docs/index.md", "utf8");
const body = md2html(src);
const html = renderPage(body);

writeFileSync(join(OUT, "index.html"), html);
writeFileSync(join(OUT, ".nojekyll"), "");

// llms.txt — AI-readable metadata (gogcli pattern)
const llms = `# ${SKILL_NAME}

> ${TAGLINE}

## What it does

Invoke \`${INVOKE}\` inside Claude Code. The skill:
1. Asks for a CLI name, description, and GitHub username.
2. Designs a CLI spec applying clig.dev conventions (flags, I/O contract, exit codes).
3. Scaffolds a complete Go project from a built-in template and pushes it to GitHub.

## Generated project includes

- Cobra CLI skeleton (root command, version subcommand, --json/--no-color/--dry-run flags)
- Makefile (build, test, lint, fmt, docs, ci, release)
- golangci-lint configuration
- goreleaser multi-platform build config (linux/darwin/windows, amd64/arm64)
- Homebrew tap dispatch workflow
- lefthook pre-commit hooks (fmt-check + lint)
- AGENTS.md canonical agent instructions (CLAUDE.md symlinks here)
- GitHub Pages docs site (pure Node.js SSG, no deps)
- GitHub Actions: CI, Release, Pages workflows

## Install

\`\`\`bash
cp SKILL.md ~/.claude/commands/create-cli.md
\`\`\`

## Source

${REPO}
`;
writeFileSync(join(OUT, "llms.txt"), llms);

if (existsSync("docs/CNAME")) {
  writeFileSync(join(OUT, "CNAME"), readFileSync("docs/CNAME"));
}

console.log(`  wrote index.html`);
console.log(`  wrote llms.txt`);
console.log(`\nDocs site built → ${OUT}/`);
