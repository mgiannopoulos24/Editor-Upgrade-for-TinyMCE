---
name: test-editor-surfaces
description: Use after any change to the plugin's PHP, compat4x.js, a ported TinyMCE plugin, or the vendored TinyMCE, to check every place WordPress creates a TinyMCE editor in the wp-env site.
---

# Testing the editor surfaces

WordPress creates TinyMCE editors in several places, each with a different settings path.
A fix that works in one can break another. Check all that the change can affect.

## Environment

`bun run start` (wp-env, http://localhost:8888, admin / password). `.wp-env.json` sets
`SCRIPT_DEBUG` (unminified core and TinyMCE, compat4x warnings on) and activates the
**Classic Editor** plugin so `post.php` uses TinyMCE. `bun run shell` opens WP-CLI.

## Surfaces

| Surface | How to open | Settings come from |
|---|---|---|
| Classic editor | Posts → Add New | `WP_Editor::editor_settings()` → `tiny_mce_before_init` |
| Visual ↔ Code switch | Click "Code" then "Visual" in the classic editor, with text selected | `wp/editor/base.js` (`switchEditors`) |
| Text widget | Appearance → Widgets (legacy widgets screen) or the Customizer | `wp.editor.getDefaultSettings()`, no PHP filter; only compat4x adapts it |
| Classic block | Deactivate Classic Editor (`wp plugin deactivate classic-editor`), add a Classic block | `wp_tinymce_inline_scripts()` → `tiny_mce_before_init` with `classic-block` |
| Teeny editor | Any `wp_editor()` call with `'teeny' => true` | `teeny_mce_before_init` |
| Front end | A page template calling `wp_editor()` | Same as the classic editor, with `is_admin()` false |

## For each surface, check

1. The editor renders with v8 chrome (`.tox-tinymce` exists) and is editable.
2. The browser console has no errors, and no "editor is disabled" or "license key" messages.
3. Type, apply bold/list, save or update, reload: the content is unchanged.
4. The specific feature you changed works, and the one next to it still works.

## Automating

When adding a Playwright spec in `tests/e2e-pw/specs/`, follow the setup in
`../Editor-Tweaks-for-CodeMirror/tests/e2e-pw/` (auth setup, `bunx wp-env run cli` for
state). Fail the test on any `page.on( 'console' )` error.
