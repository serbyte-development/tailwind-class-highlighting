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
- Cache invalidation watches CSS-family files and `package.json`. Local modules loaded through Tailwind `@plugin` or `@config` can change without invalidation until another watched event or extension restart.
- Current automated coverage is core/project unit tests. There is no VS Code extension-host integration suite for lifecycle, configuration, or theme behavior.
- Native packaging covers six desktop OS/architecture targets. Web, musl-specific, armhf, and other targets require deliberate packaging/runtime work.
- External registry state changes independently of repository state. Verify Marketplace/Open VSX status live before release decisions.
