# TaskFlow Documentation Organization Implementation Plan

> **For agentic workers:** Execute this plan inline. Documentation only; do not create a Git commit.

**Goal:** Organize existing `docs/` files into product, architecture, development, interview, design-assets, and archive areas with one entry point.

**Architecture:** Preserve document content. Use explicit directory placement, `docs/README.md`, metadata, and cross-links to distinguish active documents from the historical plan.

**Tech Stack:** Markdown, HTML, PowerShell file moves, Git status inspection.

**Spec:** User-approved organization proposal in the current conversation.

## Global Constraints

- Do not modify application source code.
- Do not delete existing documents.
- Do not execute `git add` or `git commit`.
- Preserve existing user changes.
- Mark `develop-plan.md` as archived.
- Treat `development-roadmap.md` as the learning entry point and `p0-delivery-plan.md` as the detailed MVP execution plan.

## Tasks

### Task 1: Create folders

Create `01-product`, `02-architecture`, `03-development`, `04-interview`, `05-design-assets`, `archive`, and `superpowers/plans` under `docs/`.

### Task 2: Move files explicitly

- Product: `mvp-scope.md`, `user-stories.md`, `ui-mockups.md`
- Architecture: `adr-001-technical-decisions.md`, `architecture.md`, `architecture-diagram.html`
- Development: `development-roadmap.md`, `sprint-plan.md`, `p0-delivery-plan.md`, `definition-of-done.md`, `development-language-rules.md`, `commit-rules.md`
- Interview: `interview-evidence.md`
- Design assets: `ui-design-system-v2.md`, `ui-design-system-v2.html`
- Archive: `develop-plan.md`

Use explicit `Move-Item` paths. Do not use recursive globs.

### Task 3: Create `docs/README.md`

Document the reading order, active documents, archive status, design previews, and rule that `develop-plan.md` is historical.

### Task 4: Add metadata and repair links

Add concise status, maintenance stage, and related-document metadata to active Markdown files where absent. Mark the archived plan as `已归档`. Update only relative links broken by the moves.

### Task 5: Verify

- List all files recursively and confirm expected locations.
- Search for stale references to old root-level paths.
- Run `git status --short` and `git diff --cached --name-only`.
- Confirm no staging or commit was performed.
