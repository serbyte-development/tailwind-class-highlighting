---
summary: 'Validation, esbuild bundling, native VSIX packaging, CI workflows, target matrix, and mandatory registry-publishing safety rules.'
paths:
  - .oss-release.yaml
  - esbuild.mjs
  - scripts/package.mjs
  - biome.json
  - tsconfig.json
  - .nvmrc
  - .vscodeignore
  - .github/workflows/
  - package.json
---

# Build and Release

## Validation and Build

- Repository tooling uses Node.js 24 (`.nvmrc` and CI), while the shipped extension bundle still targets Node 20 compatibility for the VS Code `^1.95.0` host contract.
- `npm run verify`: strict Biome check, TypeScript `--noEmit`, then Vitest.
- `npm run lint` / `npm run lint:fix`: Biome validation/fixes, including formatting and import organization.
- `npm run format`: Biome formatting only.
- `npm run build`: esbuild CJS bundle for Node 20 with source map.
- `npm run build:production`: minified bundle without source map.

`vscode` and `@tailwindcss/oxide` stay external to bundle. Tailwind itself is a development dependency for fixtures; runtime resolves user's project package.

## Packaging and CI

`npm run package` selects current host OS/architecture and calls `vsce package --target`, writing a target-specific VSIX. Supported matrix is macOS, Linux, Windows × x64/arm64. Unsupported host pairs fail.

`.oss-release.yaml` routes tagged `package.yml` artifacts to GitHub Release, Visual Studio Marketplace, and Open VSX. The release orchestrator uses the six platform-specific VSIX artifacts rather than rebuilding registry packages independently.

CI uses Node 24. Linux runs the complete `verify` gate and host packaging, while lightweight macOS and Windows jobs run path-sensitive tests. The Package workflow follows the same pattern: full validation once on Linux, tests on representative macOS/Windows hosts, then six OS/architecture jobs that only install and package their native target. This preserves cross-platform coverage without repeating lint/typecheck/full validation six times. Workflows use the current Node-24-generation official GitHub actions and do not publish to registries.

`.vscodeignore` keeps source, tests, benchmarks, wiki, build plans, scripts, secrets/env files, source maps, lockfile, Biome/Node-version files, and build config out of VSIX payload.

## Registry Publishing Safety

Before any Visual Studio Marketplace or Open VSX publish command:

- Require explicit user approval for exact version and registry.
- Submit one platform package at a time and inspect result before next submission.
- Stop on first error.
- Never auto-retry or rapid-fire submissions.

Registry availability and publication status are external, drift-prone facts. Recheck live state during release work instead of encoding current status here.
