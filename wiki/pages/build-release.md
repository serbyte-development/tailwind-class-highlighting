---
summary: 'Validation, esbuild bundling, native VSIX packaging, CI workflows, target matrix, and mandatory registry-publishing safety rules.'
paths:
  - esbuild.mjs
  - scripts/package.mjs
  - .vscodeignore
  - .github/workflows/
  - package.json
---

# Build and Release

## Validation and Build

- `npm test`: Vitest core/project tests.
- `npm run check`: TypeScript `--noEmit`.
- `npm run format:check`: Prettier check.
- `npm run build`: esbuild CJS bundle for Node 20 with source map.
- `npm run build:production`: minified bundle without source map.

`vscode` and `@tailwindcss/oxide` stay external to bundle. Tailwind itself is a development dependency for fixtures; runtime resolves user's project package.

## Packaging and CI

`npm run package` selects current host OS/architecture and calls `vsce package --target`, writing a target-specific VSIX. Supported matrix is macOS, Linux, Windows × x64/arm64. Unsupported host pairs fail.

CI runs install, tests, typecheck, formatting, build, and host packaging on pushes/PRs. Package workflow runs manually or on `v*` tags across all six targets and uploads artifacts. Workflows do not publish to registries.

`.vscodeignore` keeps source, tests, benchmarks, wiki, build plans, scripts, secrets/env files, source maps, lockfile, and build config out of VSIX payload.

## Registry Publishing Safety

Before any Visual Studio Marketplace or Open VSX publish command:

- Require explicit user approval for exact version and registry.
- Submit one platform package at a time and inspect result before next submission.
- Stop on first error.
- Never auto-retry or rapid-fire submissions.

Registry availability and publication status are external, drift-prone facts. Recheck live state during release work instead of encoding current status here.
