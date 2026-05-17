---
name: create-cli
description: Scaffolds production-ready CLI projects from language templates, currently supporting Go with Cobra, Makefile, golangci-lint, goreleaser, and GitHub Pages docs. Use when the user wants to bootstrap a new command-line tool project from scratch.
trigger: /create-cli
---

# Create CLI

Scaffold a complete CLI project from a language template, applying CLI design conventions from clig.dev.
Currently available template: `go`.

## Do This First

Read `templates/` in this skill's directory to understand available templates and the files each generates.
Apply the CLI design rubric from [clig.dev](https://clig.dev/) to every interface decision.

## Step 1 — Clarify

Ask only for what cannot be inferred. Proceed with best-guess defaults if the user is unsure:

1. **name** — CLI tool name (lowercase, hyphenated; e.g. `my-tool`)
2. **template** — language template to use (default: `go`)
   - `go` — Cobra, Makefile, golangci-lint, goreleaser, Homebrew tap, Node.js docs site
3. **description** — one-sentence purpose (e.g. "search and sync files across storage backends")
4. **github_user** — detect with `gh api user --jq .login`; confirm with user
5. **homebrew_tap** — Homebrew tap repo (default: `{github_user}/homebrew-tap`)
6. **color_scheme** — documentation color theme (default: `teal`)
   - `teal` — teal/cyan accent, near-black background (modern, default)
   - `ocean` — blue accent, dark navy background (familiar, developer-friendly)
   - `purple` — violet accent, deep purple background (creative, distinctive)
   - `amber` — gold accent, warm dark background (warm, unique)

Go template only: derive `module_path` as `github.com/{github_user}/{name}` — do not ask.

## Step 2 — Design

Produce a compact CLI spec the user can review before scaffolding:

1. **USAGE synopsis** — `{name} [global flags] <subcommand> [args]`
2. **Subcommands** — what each does; idempotence; state changes
3. **Args/flags table** — name, type, default, required, example
4. **I/O contract** — stdout (primary data), stderr (errors/progress)
5. **Exit codes** — `0` success · `1` runtime failure · `2` bad usage
6. **5+ example invocations** — common flows including piped/stdin

Apply these defaults unless the user overrides:
- `-h/--help` always shows help, ignores other args
- `--version` prints version to stdout
- `--json` for machine-readable output
- `--no-color` + `NO_COLOR` env respected
- `--dry-run` for any state-changing operation
- `--no-input` disables interactive prompts
- Prompts only when stdin is a TTY
- Destructive ops require `--force` or `--confirm=…` in non-interactive mode
- Ctrl-C exits fast with bounded cleanup

Show the spec to the user and wait for confirmation before proceeding to Step 3.

## Step 3 — Scaffold

After the user approves the CLI spec, generate the project:

```bash
# 1. Create GitHub repo
gh repo create {github_user}/{name} \
  --public \
  --description "{description}" \
  --clone
cd {name}

# 2. Copy templates/{template}/* with variable substitution (see table below)

# — go template only —
# 3. Initialize Go module
go mod init github.com/{github_user}/{name}
go get github.com/spf13/cobra@latest
go mod tidy

# 4. Install lefthook and activate git hooks
go install github.com/evilmartians/lefthook@latest
lefthook install
# — end go template steps —

# 5. Initial commit
git add .
git commit -m "🎉 init {name}"
git push -u origin main

# 6. Disable wiki, ensure issues are enabled
gh repo edit --enable-wiki=false

# 7. Enable GitHub Pages (docs will deploy on first push that touches docs/)
gh api repos/{github_user}/{name}/pages \
  -X POST \
  -f build_type=workflow 2>/dev/null || true

# 8. Set HOMEBREW_TAP_TOKEN so the release workflow can publish to the Homebrew tap
gh secret set HOMEBREW_TAP_TOKEN \
  --repo {github_user}/{name} \
  --body "$(gh auth token)"
```

### Template variable substitution

When copying from `templates/go/`, replace every occurrence of:

| Placeholder | Replaces with |
|-------------|---------------|
| `{{TOOL_NAME}}` | CLI name (e.g. `my-tool`) |
| `{{GITHUB_USER}}` | GitHub username/org |
| `{{DESCRIPTION}}` | One-sentence description |
| `{{HOMEBREW_TAP}}` | Homebrew tap repo (e.g. `pavelsimo/homebrew-tap`) |
| `{{YEAR}}` | Current 4-digit year |
| `{{MODULE_PATH}}` | `github.com/{github_user}/{name}` **(go template only)** |
| `{{COLOR_SCHEME}}` | Docs color theme: `teal`, `ocean`, `purple`, or `amber` |

After substitution, rename every `*.tmpl` file by stripping the `.tmpl` extension.

Create the CLAUDE.md symlink in the generated project root:
```bash
ln -s AGENTS.md CLAUDE.md
```

## Step 4 — Output Summary

```
✅ Created:    https://github.com/{github_user}/{name}
📦 Module:     github.com/{github_user}/{name}  (go template)
📄 Docs:       https://{github_user}.github.io/{name}  (deploys after first docs/ push)

Generated (go template):
  README.md            ← GitHub landing page (installation, quick start, commands)
  cmd/root.go          ← root Cobra command, global flags
  cmd/version.go       ← --version subcommand
  Makefile             ← build / test / lint / fmt / docs / ci / release targets
  .golangci.yml        ← linter config (errcheck, govet, staticcheck, gosec, revive…)
  .goreleaser.yaml     ← multi-platform builds + Homebrew tap dispatch
  .lefthook.yml        ← pre-commit: fmt-check + lint
  AGENTS.md            ← canonical agent instructions; CLAUDE.md symlinks here
  docs/index.md        ← docs landing page
  docs/install.md      ← installation instructions (Homebrew, go install, binary)
  docs/quickstart.md   ← common patterns in 60 seconds
  docs/reference.md    ← global flags, env vars, exit codes, completions
  scripts/build-docs-site.mjs  ← pure Node.js SSG, no deps (color theme: {color_scheme})
  .github/workflows/ci.yml     ← fmt-check + lint + test on every push/PR
  .github/workflows/release.yml ← goreleaser + Homebrew tap on tag push
  .github/workflows/pages.yml  ← docs site deploy on docs/ changes

Next steps:
  • Add subcommands in cmd/ (each in its own file)
  • Fill in business logic in internal/
  • Push a v0.1.0 tag to trigger the first release: git tag v0.1.0 && git push --tags
```

## Default Conventions

- Command tree is subcommand-centric: `{name} <verb> [args]`
- `SilenceUsage: true` on all RunE commands — don't dump usage on every error
- Primary data to stdout; diagnostics, progress, and errors to stderr
- Output structs defined early; human table is a rendering layer on top of the same struct
- Flag names are lowercase hyphenated (never camelCase)
- Short flags only for the most-used: `-v` verbose, `-q` quiet, `-n` dry-run, `-f` force, `-o` output
- `--read-only` / `READONLY=1` env as safety mode for agent use
- Shell completions via `cobra` built-ins (`{name} completion bash|zsh|fish|powershell`) (go template)
- README badges: `flat-square` style, `logoColor=white`, branded hex colors; order: release → license MIT → Go → Homebrew → DeepWiki; **no CI/coverage badges**
