# Wiki Maintenance

Wiki pages and raw-source metadata are agent-authored. Generated indexes are derived routing artifacts.

## Front Matter Metadata

- `summary` is required for routable pages and should stay concise. `wiki clean` warns above 240 characters.
- `paths` is optional and defines source scope whose meaningful changes could invalidate page knowledge. Do not aim for complete repository path coverage.
- `project-overview.md` should usually omit `paths` because global orientation should survive ordinary source changes.
- Update front matter when page knowledge scope changes.

Nested knowledge directories need an `index.md` with only `summary` front matter. `wiki clean` generates index body.

## Page Structure

- Keep one cohesive subject per page.
- `wiki clean` warns above 2,000 words for `project-overview.md` and 3,000 for other routable pages.
- Keep indexes small enough to route cheaply.
- Keep supporting evidence under `raw/`.

## Freshness Audit

`wiki audit` compares Git-visible contents under each page's `paths` with recorded fingerprints.

- Keep `.wiki-system/audit-state.json` committed. Treat `.wiki-system/` as machine-maintained state.
- After migration, run `wiki audit baseline` once.
- After reviewing a reported page, update it if needed, then run `wiki audit mark <wiki-page>`.
- Repeated irrelevant warnings suggest `paths` are too broad; missed stale knowledge suggests they are too narrow.

## Raw Sources

Raw sources are read-only captured evidence originating outside maintained wiki synthesis.

- Copy external evidence into `raw/`; never move or delete original source.
- Capture raw evidence as Markdown with front matter containing only a concise `summary`.
- Preserve captured bodies after ingestion. Editing existing raw sources requires explicit user approval.
- `wiki clean` generates `raw/index.md`.

## Decision Log

`decision-log.md` preserves major historical reasoning behind current direction. Record significant decisions, reversals, discoveries, rejected approaches, validations, or lessons whose reasoning is not obvious from current code or Git history. Do not use it as a changelog.

## Cleanup

After structural or material wiki changes, run `wiki clean`. Fix errors and useful warnings in owning metadata.
