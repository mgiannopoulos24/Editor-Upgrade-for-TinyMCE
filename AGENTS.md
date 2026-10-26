# Agent Development Guide

This document outlines development guidelines for agents working on Editor Upgrade for TinyMCE.

## Project Overview

A WordPress plugin that replaces the TinyMCE 4.9.11 bundled with WordPress with TinyMCE 8 (vendored, pinned in `assets/vendor/tinymce/VERSION`), plus `compat4x`, a layer that emulates TinyMCE 4 APIs still used by core and third-party plugins. Core is never patched: everything goes through script registration, editor filters, and `compat4x.js`.

Read `handoff.md` (if present) for the current state and `docs/plan.md` for the full plan.

## Key Files

- `editor-upgrade-for-tinymce.php` - Main plugin file
- `includes/class-editor-upgrade-for-tinymce.php` - Main class and TinyMCE path/version helpers
- `includes/class-editor-upgrade-for-tinymce-scripts.php` - Re-registers core's `wp-tinymce-*` handles
- `includes/class-editor-upgrade-for-tinymce-settings.php` - Editor settings and plugin-list filters, license rules
- `assets/js/compat4x.js` - TinyMCE 4 compatibility layer
- `assets/vendor/tinymce/` - Vendored TinyMCE (never edit by hand)

## Skills

- `.agents/skills/compat4x-shim` - Emulating a TinyMCE 4 API that breaks on v8
- `.agents/skills/port-wp-tinymce-plugin` - Porting a core `wp*` TinyMCE plugin to v8
- `.agents/skills/test-editor-surfaces` - Checking every place WordPress creates an editor
- `.agents/skills/update-tinymce-vendor` - Bumping the vendored TinyMCE
- `.agents/skills/wp-plugin-directory-guidelines` - WordPress.org review rules

## Non-negotiables

- License: GPLv2 or later (keeps the code mergeable into core).
- `license_key: 'gpl'` and no `api_key`, or TinyMCE 8 disables the editor. Rules live in both `apply_license_rules()` (PHP) and `applyLicenseRules()` (JS); keep them in sync.
- Saved post HTML must not change compared with the v4 editor.
- Verify TinyMCE 8 behavior against `assets/vendor/tinymce/tinymce.js`, not docs pages.
- Commits are authored by the repo owner with no AI attribution lines.

## Documentation Requirements

After any code change:

1. **readme.txt** - Update Description and Changelog
2. **changelog.txt** - Add the entry under the next version

## Version Updates

Update the version in `editor-upgrade-for-tinymce.php` (header and constant), `package.json`, and `readme.txt` (Stable tag).

## Translation Updates

After adding new translatable strings run `bun run i18n` (needs `bun run start`). Never edit the .pot file by hand, and do not add .po/.mo files or call `load_plugin_textdomain()`.

## Code Style

- PHP: WordPress coding standards (`bun run lint`), see `.agents/rules/`
- JavaScript: Vanilla JS, `'use strict'`, ES5-style functions like core's editor code
- No CDN assets; everything is bundled

## Available Scripts

```bash
bun run start           # Start dev environment (http://localhost:8888, admin / password)
bun run stop            # Stop dev environment
bun run lint            # PHPCS
bun run lint:fix        # PHPCBF
bun run i18n            # Regenerate the POT
bun run bundle          # Create build/editor-upgrade-for-tinymce.zip
bun run tinymce:update  # Re-vendor TinyMCE (optionally pass a version)
```
