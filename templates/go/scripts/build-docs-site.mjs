#!/usr/bin/env node
/**
 * docs site builder for {{TOOL_NAME}}
 *
 * Pure Node.js — zero external dependencies.
 * Reads docs/*.md → outputs a polished static site to dist/docs-site/
 *
 * Features: sidebar nav, sticky ToC, dark/light toggle, syntax highlighting,
 * copy buttons, hero on index page, llms.txt, .nojekyll, CNAME support.
 *
 * Inspired by the openclaw/gogcli docs site pattern.
 */

import {
  readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync,
} from "fs";
import { join, basename, extname } from "path";

// ── Config ────────────────────────────────────────────────────────────────────

const TOOL      = "{{TOOL_NAME}}";
const REPO_URL  = "https://github.com/{{GITHUB_USER}}/{{TOOL_NAME}}";
const BREW_TAP  = "{{HOMEBREW_TAP}}";
const DESC      = "{{DESCRIPTION}}";
const SITE_BASE = existsSync("docs/CNAME")
  ? `https://${readFileSync("docs/CNAME","utf8").trim()}`
  : `https://{{GITHUB_USER}}.github.io/{{TOOL_NAME}}`;

const SRC = "docs";
const OUT = join("dist", "docs-site");
mkdirSync(OUT, { recursive: true });

// ── Markdown parser ───────────────────────────────────────────────────────────

function esc(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/** Stash tokens to prevent double-processing during inline pass. */
function stash(s, buf) { const k=`\x00${buf.length}\x00`; buf.push(s); return k; }
function unstash(s, buf) { return s.replace(/\x00(\d+)\x00/g,(_,i)=>buf[+i]); }

// ── Syntax highlighting ───────────────────────────────────────────────────────

function hlBash(code) {
  const b=[]; let s=esc(code);
  s=s.replace(/"(?:[^"\\]|\\.)*"/g, m=>stash(`<span class=hs>${m}</span>`,b));
  s=s.replace(/'[^']*'/g,           m=>stash(`<span class=hs>${m}</span>`,b));
  s=s.replace(/(#.*)$/gm,           m=>stash(`<span class=hc>${m}</span>`,b));
  s=s.replace(/(--?[\w-]+=?\S*)/g,  m=>stash(`<span class=hf>${m}</span>`,b));
  s=s.replace(/^(\s*)(\$\s+)?(\w[\w.-]*)/gm,
    (_,sp,pr,cmd)=>`${sp}${pr||""}<span class=hk>${cmd}</span>`);
  return unstash(s,b);
}

function hlGo(code) {
  const kw=/\b(package|import|func|type|struct|interface|var|const|return|if|else|for|range|switch|case|default|break|continue|go|defer|select|chan|map|make|new|nil|true|false|error|string|int|bool|byte|rune|any)\b/g;
  const b=[]; let s=esc(code);
  s=s.replace(/("(?:[^"\\]|\\.)*"|`[^`]*`)/g, m=>stash(`<span class=hs>${m}</span>`,b));
  s=s.replace(/(\/\/.*)$/gm,                   m=>stash(`<span class=hc>${m}</span>`,b));
  s=s.replace(kw,                               m=>`<span class=hk>${m}</span>`);
  s=s.replace(/\b(\d+)\b/g,                     `<span class=hn>$1</span>`);
  return unstash(s,b);
}

function hlYaml(code) {
  const b=[]; let s=esc(code);
  s=s.replace(/(#.*)$/gm,   m=>stash(`<span class=hc>${m}</span>`,b));
  s=s.replace(/^(\s*)([\w-]+)(\s*:)/gm,
    (_,sp,k,col)=>`${sp}<span class=hk>${k}</span>${col}`);
  s=s.replace(/:\s*(.+)$/gm,
    (m,v)=>m.replace(v,`<span class=hs>${v}</span>`));
  return unstash(s,b);
}

function hlJson(code) {
  const b=[]; let s=esc(code);
  s=s.replace(/"(?:[^"\\]|\\.)*"/g, m=>stash(`<span class=hs>${m}</span>`,b));
  s=s.replace(/\b(true|false|null)\b/g, `<span class=hk>$1</span>`);
  s=s.replace(/\b(\d+\.?\d*)\b/g,       `<span class=hn>$1</span>`);
  return unstash(s,b);
}

function highlight(lang, code) {
  if (lang==="bash"||lang==="sh"||lang==="zsh") return hlBash(code);
  if (lang==="go")   return hlGo(code);
  if (lang==="yaml"||lang==="yml") return hlYaml(code);
  if (lang==="json") return hlJson(code);
  return esc(code);
}

// ── Inline Markdown ───────────────────────────────────────────────────────────

function inline(text, buf) {
  text=text.replace(/`([^`]+)`/g,
    (_,c)=>stash(`<code>${esc(c)}</code>`,buf));
  text=text.replace(/\*\*\*(.+?)\*\*\*/g,"<strong><em>$1</em></strong>");
  text=text.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
  text=text.replace(/\*(.+?)\*/g,"<em>$1</em>");
  text=text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,href)=>{
    const ext=href.startsWith("http")?` target="_blank" rel="noopener"`:"";
    return stash(`<a href="${href}"${ext}>${label}</a>`,buf);
  });
  return text;
}

// ── Markdown → HTML ───────────────────────────────────────────────────────────

function slugify(t) {
  return t.toLowerCase().replace(/[^\w\s-]/g,"").trim().replace(/\s+/g,"-");
}

/** Parse markdown source, return { html, toc: [{level,id,text}] } */
function parse(src) {
  const lines = src.split("\n");
  const buf=[], toc=[], out=[];
  let i=0, inPara=false, inUl=false, inOl=false, inFence=false;
  let fLang="", fLines=[];

  // strip frontmatter
  if (lines[0]==="---") {
    i=1; while(i<lines.length&&lines[i]!=="---") i++; i++;
  }

  function flushPara()  { if(inPara){out.push("</p>");inPara=false;} }
  function flushUl()    { if(inUl){out.push("</ul>");inUl=false;} }
  function flushOl()    { if(inOl){out.push("</ol>");inOl=false;} }
  function flushBlock() { flushPara();flushUl();flushOl(); }

  for(;i<lines.length;i++) {
    const line=lines[i];

    // fenced code
    if(line.startsWith("```")) {
      if(!inFence) {
        flushBlock();
        inFence=true; fLang=line.slice(3).trim(); fLines=[];
      } else {
        const body=highlight(fLang,fLines.join("\n"));
        const label=fLang?`<span class="code-lang">${fLang}</span>`:"";
        out.push(`<div class="code-wrap">${label}<pre><code>${body}</code></pre>`+
          `<button class="copy-btn">Copy</button></div>`);
        inFence=false; fLines=[];
      }
      continue;
    }
    if(inFence){fLines.push(line);continue;}

    // heading
    const hm=line.match(/^(#{1,4})\s+(.*)/);
    if(hm) {
      flushBlock();
      const lvl=hm[1].length, rawText=hm[2];
      const id=slugify(rawText);
      const text=unstash(inline(rawText,buf),buf);
      if(lvl<=3) toc.push({level:lvl,id,text:rawText});
      out.push(`<h${lvl} id="${id}"><a class="anchor" href="#${id}">#</a>${text}</h${lvl}>`);
      continue;
    }

    // blockquote
    if(line.startsWith(">")) {
      flushBlock();
      const text=unstash(inline(line.slice(1).trim(),buf),buf);
      out.push(`<blockquote><p>${text}</p></blockquote>`);
      continue;
    }

    // horizontal rule
    if(line.match(/^-{3,}$/)){flushBlock();out.push("<hr>");continue;}

    // table — collect all pipe-starting lines
    if(line.startsWith("|")) {
      flushBlock();
      const rows=[line];
      while(i+1<lines.length&&lines[i+1].startsWith("|")) rows.push(lines[++i]);
      out.push('<table>');
      rows.forEach((row,ri)=>{
        if(row.match(/^\|[-| :]+\|$/)) return; // separator
        const cells=row.split("|").slice(1,-1);
        const tag=ri===0?"th":"td";
        out.push("<tr>"+cells.map(c=>`<${tag}>${unstash(inline(c.trim(),buf),buf)}</${tag}>`).join("")+"</tr>");
      });
      out.push("</table>");
      continue;
    }

    // unordered list
    if(line.match(/^[-*]\s/)) {
      flushPara(); flushOl();
      if(!inUl){out.push("<ul>");inUl=true;}
      out.push(`<li>${unstash(inline(line.replace(/^[-*]\s/,""),buf),buf)}</li>`);
      continue;
    }

    // ordered list
    if(line.match(/^\d+\.\s/)) {
      flushPara(); flushUl();
      if(!inOl){out.push("<ol>");inOl=true;}
      out.push(`<li>${unstash(inline(line.replace(/^\d+\.\s/,""),buf),buf)}</li>`);
      continue;
    }

    // blank
    if(line.trim()===""){flushBlock();continue;}

    // paragraph
    flushUl();flushOl();
    if(!inPara){out.push("<p>");inPara=true;} else out.push(" ");
    out.push(unstash(inline(line,buf),buf));
  }
  flushBlock();
  return {html:out.join("\n"),toc};
}

// ── Page structure ────────────────────────────────────────────────────────────

function tocHtml(toc) {
  if(toc.length<2) return "";
  const items=toc.map(({id,text,level})=>
    `<li class="toc-${level}"><a href="#${id}">${esc(text)}</a></li>`
  ).join("\n");
  return `<nav class="toc" aria-label="On this page">
  <p class="toc-title">On this page</p>
  <ul>${items}</ul>
</nav>`;
}

function sidebarHtml(pages, currentSlug) {
  const links=pages.map(({slug,label})=>
    `<li><a href="${slug}.html"${slug===currentSlug?' class="active"':""}>${label}</a></li>`
  ).join("\n");
  return `<nav class="sidebar" id="sidebar" aria-label="Site navigation">
  <div class="sidebar-brand">
    <a href="index.html" class="brand-link">${TOOL}</a>
  </div>
  <ul class="sidebar-nav">${links}</ul>
  <div class="sidebar-footer">
    <a href="${REPO_URL}" target="_blank" rel="noopener" class="gh-link">
      <svg height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      GitHub
    </a>
  </div>
</nav>`;
}

function heroHtml() {
  return `<section class="hero">
  <p class="hero-eyebrow">CLI Tool</p>
  <h1 class="hero-title">${TOOL}</h1>
  <p class="hero-desc">${esc(DESC)}</p>
  <div class="hero-actions">
    <a class="btn-primary" href="#installation">Get started</a>
    <a class="btn-outline" href="${REPO_URL}" target="_blank" rel="noopener">GitHub</a>
  </div>
  <div class="install-cmd">
    <span class="install-label">Install</span>
    <code>brew install ${TOOL}</code>
    <button class="copy-btn" data-copy="brew install ${TOOL}">Copy</button>
  </div>
</section>`;
}

// ── Full page HTML ────────────────────────────────────────────────────────────

function renderPage({slug, title, bodyHtml, toc, pages, isIndex}) {
  const sidebar  = sidebarHtml(pages, slug);
  const tocBlock = tocHtml(toc);
  const hero     = isIndex ? heroHtml() : "";
  const pageTitle= isIndex ? TOOL : `${title} — ${TOOL}`;

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${pageTitle}</title>
<meta name="description" content="${esc(DESC)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${pageTitle}">
<meta property="og:description" content="${esc(DESC)}">
<meta property="og:url" content="${SITE_BASE}/${slug === "index" ? "" : slug + ".html"}">
<meta name="twitter:card" content="summary">
<style>
/* ── Reset + tokens ─────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --sidebar-w:240px;--toc-w:210px;
  --font-sans:system-ui,-apple-system,"Segoe UI",sans-serif;
  --font-mono:"JetBrains Mono","Fira Code","SF Mono",monospace;
}
[data-theme=dark]{
  --bg:#0d1117;--surface:#161b22;--surface2:#1f2937;
  --border:#21262d;--text:#e6edf3;--muted:#7d8590;
  --accent:#58a6ff;--accent2:#3fb950;--accent3:#f78166;
  --code-bg:#161b22;--hl-bg:#1f2937;
}
[data-theme=light]{
  --bg:#ffffff;--surface:#f6f8fa;--surface2:#eaecef;
  --border:#d0d7de;--text:#1f2328;--muted:#656d76;
  --accent:#0969da;--accent2:#1a7f37;--accent3:#cf222e;
  --code-bg:#f6f8fa;--hl-bg:#eaecef;
}

/* ── Base ───────────────────────────────────────────── */
html{scroll-behavior:smooth;font-size:16px}
body{background:var(--bg);color:var(--text);font:1rem/1.75 var(--font-sans);min-height:100vh;display:flex;flex-direction:column}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
img{max-width:100%}
hr{border:none;border-top:1px solid var(--border);margin:2rem 0}

/* ── Top nav ────────────────────────────────────────── */
.topnav{
  position:sticky;top:0;z-index:100;
  background:var(--surface);border-bottom:1px solid var(--border);
  padding:.6rem 1.25rem;
  display:flex;align-items:center;gap:1rem;
  height:56px;
}
.topnav .hamburger{display:none;background:none;border:none;cursor:pointer;color:var(--muted);padding:.25rem}
.topnav .hamburger svg{display:block}
.topnav .nav-brand{font-weight:700;font-size:1rem;color:var(--text);white-space:nowrap}
.topnav .nav-brand span{color:var(--accent)}
.topnav .spacer{flex:1}
.topnav .nav-link{color:var(--muted);font-size:.875rem;white-space:nowrap}
.topnav .nav-link:hover{color:var(--text);text-decoration:none}
.topnav .theme-btn{
  background:none;border:1px solid var(--border);border-radius:6px;
  cursor:pointer;padding:.3rem .55rem;color:var(--muted);font-size:.8rem;
  display:flex;align-items:center;gap:.35rem;white-space:nowrap;
}
.topnav .theme-btn:hover{color:var(--text);border-color:var(--accent)}
.icon-sun,.icon-moon{display:none}
[data-theme=dark]  .icon-moon{display:inline}
[data-theme=light] .icon-sun{display:inline}

/* ── Layout ─────────────────────────────────────────── */
.layout{display:flex;flex:1;max-width:1280px;margin:0 auto;width:100%;padding:0 1rem}

/* ── Sidebar ────────────────────────────────────────── */
.sidebar{
  width:var(--sidebar-w);flex-shrink:0;
  position:sticky;top:56px;height:calc(100vh - 56px);overflow-y:auto;
  padding:1.5rem .75rem 2rem;
  border-right:1px solid var(--border);
  display:flex;flex-direction:column;gap:1rem;
}
.sidebar-brand .brand-link{font-weight:700;font-size:1rem;color:var(--text)}
.sidebar-brand .brand-link:hover{color:var(--accent);text-decoration:none}
.sidebar-nav{list-style:none;display:flex;flex-direction:column;gap:.15rem;margin-top:.5rem}
.sidebar-nav a{
  display:block;padding:.35rem .75rem;border-radius:6px;
  color:var(--muted);font-size:.875rem;transition:background .12s,color .12s;
}
.sidebar-nav a:hover{background:var(--surface2);color:var(--text);text-decoration:none}
.sidebar-nav a.active{background:var(--surface2);color:var(--accent);font-weight:600}
.sidebar-footer{margin-top:auto;padding-top:1rem;border-top:1px solid var(--border)}
.gh-link{display:flex;align-items:center;gap:.4rem;font-size:.8rem;color:var(--muted)}
.gh-link:hover{color:var(--text);text-decoration:none}

/* ── Main content ───────────────────────────────────── */
.main{flex:1;min-width:0;padding:2rem 2.5rem 4rem}

/* ── ToC ────────────────────────────────────────────── */
.toc{
  width:var(--toc-w);flex-shrink:0;
  position:sticky;top:56px;height:calc(100vh - 56px);overflow-y:auto;
  padding:1.5rem .5rem 2rem;font-size:.825rem;
}
.toc-title{font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-size:.7rem;margin-bottom:.75rem;padding:0 .5rem}
.toc ul{list-style:none;display:flex;flex-direction:column;gap:.1rem}
.toc-2 a{padding:.25rem .5rem;display:block;border-radius:4px;color:var(--muted);transition:color .12s}
.toc-3 a{padding:.2rem .5rem .2rem 1.25rem;display:block;border-radius:4px;color:var(--muted);font-size:.8rem;transition:color .12s}
.toc a:hover,.toc a.active{color:var(--accent);text-decoration:none}

/* ── Hero ───────────────────────────────────────────── */
.hero{padding:3rem 0 2.5rem;border-bottom:1px solid var(--border);margin-bottom:2.5rem}
.hero-eyebrow{font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);margin-bottom:.75rem}
.hero-title{font-size:clamp(2rem,4vw,2.75rem);font-weight:800;letter-spacing:-.04em;line-height:1.15;margin-bottom:.75rem}
.hero-desc{font-size:1.05rem;color:var(--muted);max-width:540px;margin-bottom:1.75rem;line-height:1.6}
.hero-actions{display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1.75rem}
.btn-primary{background:var(--accent);color:#0d1117;font-weight:600;padding:.5rem 1.25rem;border-radius:6px;font-size:.9rem;transition:opacity .15s}
.btn-primary:hover{opacity:.85;text-decoration:none}
.btn-outline{border:1px solid var(--border);color:var(--text);padding:.5rem 1.25rem;border-radius:6px;font-size:.9rem;transition:border-color .15s}
.btn-outline:hover{border-color:var(--accent);text-decoration:none}
.install-cmd{
  display:inline-flex;align-items:center;gap:.75rem;
  background:var(--surface);border:1px solid var(--border);
  padding:.6rem 1rem;border-radius:8px;font-size:.875rem;
}
.install-label{font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.install-cmd code{background:none;border:none;padding:0;font-family:var(--font-mono);color:var(--accent2)}

/* ── Typography ─────────────────────────────────────── */
.main h1{font-size:1.75rem;font-weight:800;letter-spacing:-.03em;margin-bottom:1rem}
.main h2{font-size:1.25rem;font-weight:700;border-bottom:1px solid var(--border);padding-bottom:.4rem;margin:2.25rem 0 1rem;scroll-margin-top:72px}
.main h3{font-size:1rem;font-weight:600;margin:1.75rem 0 .6rem;scroll-margin-top:72px}
.main h4{font-size:.9rem;font-weight:600;color:var(--muted);margin:1.25rem 0 .5rem;scroll-margin-top:72px}
.main p{margin-bottom:.9rem}
.main ul,.main ol{padding-left:1.4rem;margin-bottom:.9rem}
.main li{margin-bottom:.3rem}
.main blockquote{border-left:3px solid var(--accent);padding:.5rem 1rem;background:var(--surface);border-radius:0 6px 6px 0;margin:1rem 0;color:var(--muted)}
.anchor{opacity:0;font-size:.85em;color:var(--muted);margin-right:.4rem;text-decoration:none}
h2:hover .anchor,h3:hover .anchor{opacity:1}

/* ── Inline code ────────────────────────────────────── */
code{
  background:var(--code-bg);border:1px solid var(--border);
  padding:.15em .45em;border-radius:4px;
  font-family:var(--font-mono);font-size:.875em;
}

/* ── Code blocks ────────────────────────────────────── */
.code-wrap{position:relative;margin:1rem 0}
.code-lang{
  position:absolute;top:.5rem;left:1rem;
  font-family:var(--font-mono);font-size:.7rem;
  color:var(--muted);text-transform:lowercase;letter-spacing:.04em;
  pointer-events:none;
}
pre{
  background:var(--code-bg);border:1px solid var(--border);
  border-radius:8px;padding:1.25rem 1.25rem 1.25rem 1.25rem;
  overflow-x:auto;font-family:var(--font-mono);font-size:.85rem;line-height:1.65;
}
pre code{background:none;border:none;padding:0;font-size:inherit}
.copy-btn{
  position:absolute;top:.5rem;right:.5rem;
  background:var(--surface2);border:1px solid var(--border);
  color:var(--muted);font-size:.72rem;padding:.22rem .55rem;border-radius:4px;
  cursor:pointer;font-family:var(--font-sans);transition:color .12s,border-color .12s;
}
.copy-btn:hover{color:var(--text);border-color:var(--accent)}
.copy-btn.ok{color:var(--accent2);border-color:var(--accent2)}

/* ── Syntax highlight tokens ────────────────────────── */
.hk{color:#ff7b72}  /* keyword / command */
.hs{color:#a5d6ff}  /* string */
.hn{color:#79c0ff}  /* number */
.hc{color:#8b949e;font-style:italic} /* comment */
.hf{color:#ffa657}  /* flag */
[data-theme=light] .hk{color:#cf222e}
[data-theme=light] .hs{color:#0a3069}
[data-theme=light] .hn{color:#0550ae}
[data-theme=light] .hc{color:#6e7781}
[data-theme=light] .hf{color:#953800}

/* ── Tables ─────────────────────────────────────────── */
table{width:100%;border-collapse:collapse;margin:1rem 0;font-size:.9rem}
th{background:var(--surface);text-align:left;padding:.5rem .85rem;border:1px solid var(--border);font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
td{padding:.5rem .85rem;border:1px solid var(--border);vertical-align:top}
td code{font-size:.8em}

/* ── Responsive ─────────────────────────────────────── */
@media(max-width:1100px){.toc{display:none}}
@media(max-width:768px){
  .layout{padding:0}
  .sidebar{
    position:fixed;top:56px;left:0;height:calc(100vh - 56px);z-index:90;
    transform:translateX(-100%);transition:transform .22s ease;
    background:var(--bg);border-right:1px solid var(--border);
  }
  .sidebar.open{transform:translateX(0)}
  .topnav .hamburger{display:flex}
  .main{padding:1.5rem 1rem 3rem}
}
</style>
</head>
<body>

<!-- top nav -->
<header class="topnav">
  <button class="hamburger" id="ham" aria-label="Toggle menu">
    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="3" y1="6"  x2="17" y2="6"/>
      <line x1="3" y1="10" x2="17" y2="10"/>
      <line x1="3" y1="14" x2="17" y2="14"/>
    </svg>
  </button>
  <a class="nav-brand" href="index.html"><span>${TOOL}</span></a>
  <div class="spacer"></div>
  <a class="nav-link" href="${REPO_URL}" target="_blank" rel="noopener">GitHub ↗</a>
  <button class="theme-btn" id="themeBtn" aria-label="Toggle theme">
    <span class="icon-sun">☀️</span>
    <span class="icon-moon">🌙</span>
    <span id="themeLabel">Light</span>
  </button>
</header>

<!-- layout -->
<div class="layout">
  ${sidebar}
  <main class="main">
    ${hero}
    ${bodyHtml}
  </main>
  ${tocBlock}
</div>

<script>
// theme toggle
const root=document.documentElement;
const btn=document.getElementById("themeBtn");
const label=document.getElementById("themeLabel");
const stored=localStorage.getItem("theme")||"dark";
root.dataset.theme=stored;
label.textContent=stored==="dark"?"Light":"Dark";
btn.addEventListener("click",()=>{
  const next=root.dataset.theme==="dark"?"light":"dark";
  root.dataset.theme=next;
  localStorage.setItem("theme",next);
  label.textContent=next==="dark"?"Light":"Dark";
});

// hamburger
const ham=document.getElementById("ham");
const sidebar=document.getElementById("sidebar");
ham.addEventListener("click",()=>sidebar.classList.toggle("open"));
document.addEventListener("click",e=>{
  if(!sidebar.contains(e.target)&&!ham.contains(e.target))
    sidebar.classList.remove("open");
});

// copy buttons
document.querySelectorAll(".copy-btn").forEach(btn=>{
  btn.addEventListener("click",()=>{
    const pre=btn.previousElementSibling;
    const text=btn.dataset.copy||(pre&&pre.innerText)||"";
    navigator.clipboard.writeText(text.trim()).then(()=>{
      btn.textContent="Copied!";btn.classList.add("ok");
      setTimeout(()=>{btn.textContent="Copy";btn.classList.remove("ok");},2000);
    });
  });
});

// ToC scroll-spy
const tocLinks=[...document.querySelectorAll(".toc a")];
if(tocLinks.length){
  const heads=[...document.querySelectorAll("h2[id],h3[id]")];
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting){
        tocLinks.forEach(a=>a.classList.remove("active"));
        const a=document.querySelector('.toc a[href="#'+e.target.id+'"]');
        if(a)a.classList.add("active");
      }
    });
  },{rootMargin:"-56px 0px -70% 0px"});
  heads.forEach(h=>obs.observe(h));
}
</script>
</body>
</html>`;
}

// ── Build ─────────────────────────────────────────────────────────────────────

const mdFiles = readdirSync(SRC)
  .filter(f => extname(f) === ".md")
  .sort((a,b) => {
    if(a==="index.md") return -1;
    if(b==="index.md") return 1;
    return a.localeCompare(b);
  });

function fileToLabel(filename) {
  return basename(filename,".md")
    .replace(/-/g," ")
    .replace(/\b\w/g,c=>c.toUpperCase())
    .replace(/^Index$/,"Home");
}

const pages = mdFiles.map(f => ({
  slug:  basename(f,".md"),
  label: fileToLabel(f),
  file:  f,
}));

for(const {slug,label,file} of pages) {
  const src    = readFileSync(join(SRC,file),"utf8");
  const {html,toc} = parse(src);
  const output = renderPage({
    slug, title:label, bodyHtml:html, toc, pages,
    isIndex: slug==="index",
  });
  writeFileSync(join(OUT,`${slug}.html`), output);
  console.log(`  wrote ${slug}.html  (${toc.length} ToC entries)`);
}

// .nojekyll
writeFileSync(join(OUT,".nojekyll"),"");

// CNAME
if(existsSync(join(SRC,"CNAME")))
  writeFileSync(join(OUT,"CNAME"),readFileSync(join(SRC,"CNAME")));

// llms.txt — AI-readable metadata
writeFileSync(join(OUT,"llms.txt"),
`# ${TOOL}

> ${DESC}

## Install

\`\`\`bash
brew tap ${BREW_TAP}
brew install ${TOOL}
\`\`\`

## Source

${REPO_URL}

## Docs

${SITE_BASE}/
`);

console.log(`\nSite built → ${OUT}/  (${pages.length} page${pages.length===1?"":"s"})`);
