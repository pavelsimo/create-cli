---
title: create-cli
description: A skill for agents that scaffolds production-ready Go CLI projects with a single command.
---

# create-cli

A skill for agents that scaffolds production-ready Go CLI projects with a single command.
Invoke `/create-cli`, answer a few questions, and get a complete project: Cobra command tree,
Makefile, CI/CD, golangci-lint, lefthook git hooks, goreleaser multi-platform releases,
Homebrew tap dispatch, and a GitHub Pages docs site — all wired together and pushed to GitHub.

## Invoke

```
/create-cli
```

The skill asks for a name and description, shows you a CLI design spec to review (applying
[clig.dev](https://clig.dev/) conventions), then scaffolds and pushes the full project.

## What Gets Generated

| File / Directory | Purpose |
|---|---|
| `cmd/root.go` | Root Cobra command with global flags (`--json`, `--no-color`, `--verbose`, `--dry-run`) |
| `cmd/version.go` | `version` subcommand |
| `Makefile` | `build`, `test`, `lint`, `fmt`, `docs`, `ci`, `release` targets |
| `.golangci.yml` | Linter config (errcheck, govet, staticcheck, gosec, revive, gocritic, misspell) |
| `.goreleaser.yaml` | Multi-platform builds (linux/darwin/windows, amd64/arm64) + Homebrew tap dispatch |
| `.lefthook.yml` | Pre-commit hooks: fmt-check + lint |
| `AGENTS.md` | Canonical agent instructions; `CLAUDE.md` symlinks here |
| `docs/index.md` | Project docs landing page |
| `scripts/build-docs-site.mjs` | Pure Node.js SSG — no deps, outputs to `dist/docs-site/` |
| `.github/workflows/ci.yml` | CI: fmt-check + lint + test on every push/PR |
| `.github/workflows/release.yml` | Release: goreleaser + Homebrew tap on tag push |
| `.github/workflows/pages.yml` | Docs deploy to GitHub Pages on `docs/**` changes |

## Template Variables

| Variable | Default | Description |
|---|---|---|
| `TOOL_NAME` | _(required)_ | CLI name, lowercase hyphenated |
| `GITHUB_USER` | detected via `gh api user` | GitHub username or org |
| `DESCRIPTION` | _(required)_ | One-sentence purpose |
| `MODULE_PATH` | `github.com/{user}/{name}` | Go module path |
| `HOMEBREW_TAP` | `{user}/homebrew-tap` | Homebrew tap repo |

## Installation

### Claude Code

```bash
mkdir -p ~/.claude/commands
cp SKILL.md ~/.claude/commands/create-cli.md
```

Invoke: type `/create-cli` in any Claude Code session.

### OpenAI Codex

Add to `AGENTS.md`:

```markdown
## create-cli
when scaffolding a new Go CLI project, follow the rules defined in SKILL.md exactly.
```

Or append globally:

```bash
cat SKILL.md >> ~/.codex/instructions.md
```

### GitHub Copilot

```bash
mkdir -p .github
cat SKILL.md >> .github/copilot-instructions.md
```

## Attribution

Inspired by the [create-cli](https://github.com/steipete/agent-scripts/tree/main/skills/create-cli)
skill from [steipete/agent-scripts](https://github.com/steipete/agent-scripts) by [@steipete](https://github.com/steipete).

CLI design conventions from [clig.dev](https://clig.dev/) by Aanand Prasad, Ben Firshman,
Carl Tashian, and Eva Parish.

Go project patterns from [openclaw/gogcli](https://github.com/openclaw/gogcli).
