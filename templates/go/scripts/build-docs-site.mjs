#!/usr/bin/env node
/**
 * Pure Node.js documentation site builder — no external dependencies.
 * Reads docs/*.md, outputs a styled HTML site to dist/docs-site/.
 *
 * Follows the steipete/openclaw pattern: lightweight, dependency-free,
 * easy to understand and modify.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join, basename, extname } from "path";

const SRC_DIR = "docs";
const OUT_DIR = join("dist", "docs-site");
const TOOL_NAME = "{{TOOL_NAME}}";
const GITHUB_USER = "{{GITHUB_USER}}";
const REPO = `${GITHUB_USER}/${TOOL_NAME}`;

mkdirSync(OUT_DIR, { recursive: true });

/** Minimal Markdown → HTML (headings, code blocks, bold, links, tables, lists). */
function md2html(md) {
  let html = md
    // fenced code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const cls = lang ? ` class="language-${lang}"` : "";
      return `<pre><code${cls}>${escape(code.trimEnd())}</code></pre>`;
    })
    // headings
    .replace(/^######\s+(.+)$/gm, "<h6>$1</h6>")
    .replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>")
    .replace(/^####\s+(.+)$/gm, "<h4>$1</h4>")
    .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>")
    // horizontal rule
    .replace(/^---$/gm, "<hr>")
    // bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // unordered lists
    .replace(/^\s*[-*]\s+(.+)$/gm, "<li>$1</li>")
    // ordered lists
    .replace(/^\s*\d+\.\s+(.+)$/gm, "<li>$1</li>")
    // paragraphs (double newline → </p><p>)
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[h1-6hrlupot])(.+)$/gm, "$1");

  // wrap adjacent <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>\n?)+/gs, (m) => `<ul>${m}</ul>`);

  return html;
}

function escape(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function page(title, bodyHtml, navLinks) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — ${TOOL_NAME}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f1117; --surface: #1a1d27; --border: #2a2d3a;
      --text: #e2e8f0; --muted: #94a3b8; --accent: #60a5fa;
      --code-bg: #1e2130; --font-mono: "SF Mono", "Fira Code", monospace;
    }
    body { background: var(--bg); color: var(--text); font: 16px/1.7 system-ui, sans-serif; }
    nav {
      position: sticky; top: 0; z-index: 10;
      background: var(--surface); border-bottom: 1px solid var(--border);
      padding: .75rem 2rem; display: flex; align-items: center; gap: 1.5rem;
    }
    nav .brand { font-weight: 700; color: var(--accent); text-decoration: none; }
    nav a { color: var(--muted); text-decoration: none; font-size: .9rem; }
    nav a:hover { color: var(--text); }
    main { max-width: 860px; margin: 0 auto; padding: 2.5rem 2rem 4rem; }
    h1 { font-size: 2rem; font-weight: 800; margin-bottom: 1.5rem; }
    h2 { font-size: 1.4rem; font-weight: 700; margin: 2rem 0 .75rem; border-bottom: 1px solid var(--border); padding-bottom: .4rem; }
    h3 { font-size: 1.1rem; font-weight: 600; margin: 1.5rem 0 .5rem; }
    p { margin-bottom: 1rem; }
    a { color: var(--accent); }
    code { background: var(--code-bg); padding: .15em .4em; border-radius: 4px; font-family: var(--font-mono); font-size: .875em; }
    pre { background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px; padding: 1.25rem; overflow-x: auto; margin: 1rem 0; }
    pre code { background: none; padding: 0; font-size: .85em; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: .9rem; }
    th { background: var(--surface); text-align: left; padding: .5rem .75rem; border: 1px solid var(--border); }
    td { padding: .5rem .75rem; border: 1px solid var(--border); }
    ul, ol { padding-left: 1.5rem; margin-bottom: 1rem; }
    li { margin-bottom: .25rem; }
    hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }
  </style>
</head>
<body>
  <nav>
    <a class="brand" href="index.html">${TOOL_NAME}</a>
    ${navLinks.map((l) => `<a href="${l.href}">${l.label}</a>`).join("")}
    <a href="https://github.com/${REPO}" target="_blank" rel="noopener">GitHub ↗</a>
  </nav>
  <main>${bodyHtml}</main>
</body>
</html>`;
}

// Collect source files
const files = readdirSync(SRC_DIR)
  .filter((f) => extname(f) === ".md")
  .sort();

const navLinks = files.map((f) => ({
  label: basename(f, ".md").replace(/-/g, " "),
  href: basename(f, ".md") + ".html",
}));

for (const file of files) {
  const src = readFileSync(join(SRC_DIR, file), "utf8");
  const name = basename(file, ".md");
  const title = name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, " ");
  const body = md2html(src);
  const out = page(title, `<p>${body}</p>`, navLinks.filter((l) => l.href !== name + ".html"));
  writeFileSync(join(OUT_DIR, name + ".html"), out);
  console.log(`  wrote ${name}.html`);
}

console.log(`\nDocs site built → ${OUT_DIR}/`);
