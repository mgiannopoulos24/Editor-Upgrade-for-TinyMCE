# Project charter

**Status: approved by the owner on 2026-11-07.**

## Goal

Ship a WordPress plugin that replaces the TinyMCE 4.9.11 bundled with core with TinyMCE 8, and keeps plugins written for TinyMCE 4 working through a compatibility layer.

The plugin is the product. Core committers closed Trac #47218 as `wontfix` in June 2025 and called this "squarely in plugin territory", so a core merge is a later, conditional step. It is only proposed if the plugin's results give maintainers a reason to reopen the ticket.

## Scope

In scope:

- TinyMCE 8 in the classic editor, the Classic block, the Text widget, the Customizer, and `wp_editor()`.
- `compat4x`, the TinyMCE 4 compatibility layer.
- Native ports of WordPress's nine TinyMCE plugins.
- Saved post content identical to TinyMCE 4, with every exception listed and justified.

Out of scope:

- Patching WordPress core. Everything goes through script registration, editor filters, and `compat4x`.
- Replacing TinyMCE with another editor, or removing the classic editor.
- Rewriting third-party plugins. They get compatibility and a [migration guide](../MIGRATION.md).
- Internet Explorer.

## Non-negotiable rules

- GPLv2 or later.
- `license_key: 'gpl'` and no `api_key`, or TinyMCE 8 disables the editor.
- Saved post HTML must not change compared with the TinyMCE 4 editor.
- TinyMCE 8 behavior is verified against the vendored source, not documentation pages.

## Owners

This is a one-person project today, so every workstream has the same owner. The table exists so that a contributor can take a workstream over.

| Workstream | Owner | Notes |
|---|---|---|
| Project lead and release decisions | mgiannopoulos24 | |
| `compat4x` and JavaScript | mgiannopoulos24 | |
| PHP integration | mgiannopoulos24 | |
| CSS and UI | mgiannopoulos24 | |
| QA and test suite | mgiannopoulos24 | |
| Accessibility | mgiannopoulos24 | An outside audit is needed before the exit criteria are met |
| Security | mgiannopoulos24 | An outside review is needed before the exit criteria are met |
| Documentation and community | mgiannopoulos24 | |

## Budgets

Performance, accessibility, and compatibility budgets are in `docs/plan.md` Sections 13 and 14. Current measurements are in [baseline.md](baseline.md).

## How progress is tracked

- `docs/plan.md`: the full plan.
- [compatibility.md](compatibility.md): compatibility results for real plugins.
- Each phase ends at a gate in `docs/plan.md` Section 8.
