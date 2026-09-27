---
summary: 'Current correctness and maintenance risks that can change implementation choices or require targeted validation.'
paths:
  - src/core/regions.ts
  - src/tailwind/project.ts
  - src/extension/controller.ts
  - scripts/package.mjs
  - .github/workflows/package.yml
---

# Open Questions and Risks

- Source-region discovery is textual, not AST based. Unusual framework syntax can expose parser gaps; extend focused region tests with any parser change.
- Tailwind v4 CSS-root discovery intentionally implements a smaller model than full Tailwind IntelliSense. Exact import anchoring and ambiguity handling favor deterministic correctness over broader heuristics.
- Cache invalidation watches saved CSS-family files and `package.json`. `@plugin` / `@config` modules are not individually watched, and Node's module cache can retain their code even after a CSS-triggered validator reload. An extension-host reload may be required. See [Tailwind Project Resolution](./tailwind-project-resolution.md) for watcher exclusions, symlinks, and cache ownership.
- Current automated coverage is core/project unit tests. There is no VS Code extension-host integration suite for lifecycle, configuration, or theme behavior.
- Native packaging covers six desktop OS/architecture targets. Web, musl-specific, armhf, and other targets require deliberate packaging/runtime work.
- External registry state changes independently of repository state. Verify Marketplace/Open VSX status live before release decisions.
