# Decision Log

## 2026-08-11 — Tailwind v4 design system became semantic authority

Project-local Tailwind v4 validation replaced the temporary hand-maintained utility classifier. Reliable v3 support would require a separate config/JIT compatibility subsystem, so v3, missing installs, ambiguous projects, and failed design-system loads intentionally produce no highlighting.

## 2026-08-11 — Project discovery became import anchored

Exact `@import "tailwindcss"` anchors replaced stylesheet scoring and Tailwind-looking heuristics. Relative CSS importers are followed to top-level entrypoints; nearest entrypoint wins and equal-distance entrypoints return no project. Workspace roots bound ancestor resolution when VS Code supplies one.

## 2026-08-11 — Bundled Oxide kept as tokenizer

Extension keeps `@tailwindcss/oxide` as lazy candidate scanner because a user's `tailwindcss` install does not guarantee a directly resolvable Oxide package. Semantic validity and breakpoint metadata still come from user's Tailwind v4 design system.

## 2026-08-11 — Registry publishing remained manual after v0.1.0

Visual Studio Marketplace `v0.1.0` was released as six platform-specific packages. Registry writes remain explicit user-approved actions: approve exact version and registry immediately before publish, submit packages sequentially, inspect each result, and stop on first error. Automatic retries are prohibited.
