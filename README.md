# create-cli skill

![CI](https://github.com/pavelsimo/create-cli/actions/workflows/ci.yml/badge.svg)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A skill for agents that scaffolds production-ready CLI projects from language templates. Invoke `/create-cli`, pick a template, and get a complete project pushed to GitHub.

**Available templates:**

| Template | Language | Stack |
|---|---|---|
| `go` | Go | Cobra, Makefile, golangci-lint, goreleaser, Homebrew tap, Node.js docs site |

## Usage

```
/create-cli
```

The skill asks for a name and description, shows you a CLI design spec to review, then generates the full project on GitHub.

## What Gets Created (go template)

| File / Directory | Purpose |
|---|---|
| `cmd/root.go` | Root Cobra command with global flags (`--json`, `--no-color`, `--verbose`, `--dry-run`) |
| `cmd/version.go` | `--version` subcommand |
| `Makefile` | `build`, `test`, `lint`, `fmt`, `docs`, `ci`, `release` targets |
| `.golangci.yml` | Linter config (errcheck, govet, staticcheck, gosec, revive, gocritic, misspell) |
| `.goreleaser.yaml` | Multi-platform builds (linux/darwin/windows, amd64/arm64) + Homebrew tap dispatch |
| `.lefthook.yml` | Pre-commit hooks: fmt-check + lint |
| `AGENTS.md` | Canonical agent instructions; `CLAUDE.md` symlinks here |
| `docs/index.md` | Project docs landing page |
| `scripts/build-docs-site.mjs` | Pure Node.js SSG — no external deps, outputs to `dist/docs-site/` |
| `.github/workflows/ci.yml` | CI: fmt-check + lint + test on every push/PR |
| `.github/workflows/release.yml` | Release: goreleaser + Homebrew tap dispatch on tag push |
| `.github/workflows/pages.yml` | Docs deploy to GitHub Pages on `docs/**` changes |

## Template Variables

| Variable | Default | Description |
|---|---|---|
| `{{TOOL_NAME}}` | _(required)_ | CLI name, lowercase hyphenated |
| `{{GITHUB_USER}}` | detected via `gh api user` | GitHub username or org |
| `{{DESCRIPTION}}` | _(required)_ | One-sentence purpose |
| `{{HOMEBREW_TAP}}` | `{user}/homebrew-tap` | Homebrew tap repo |
| `{{YEAR}}` | current year | Used in LICENSE |
| `{{MODULE_PATH}}` | `github.com/{user}/{name}` | Go module path _(go template only)_ |

## Installation

```bash
npx skills@latest add pavelsimo/create-cli
```

## Attribution

Inspired by the [create-cli](https://github.com/steipete/agent-scripts/tree/main/skills/create-cli) skill from [steipete/agent-scripts](https://github.com/steipete/agent-scripts) by [@steipete](https://github.com/steipete).

CLI design conventions from [clig.dev](https://clig.dev/) by Aanand Prasad, Ben Firshman, Carl Tashian, and Eva Parish.

Go project structure patterns extracted from [openclaw/gogcli](https://github.com/openclaw/gogcli).

## Contributing

Open an issue or pull request. Keep commits atomic and follow the [/commit skill](https://github.com/pavelsimo/commit) convention.

## License

MIT
