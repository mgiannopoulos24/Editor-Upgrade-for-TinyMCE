# Editor Upgrade for TinyMCE

Replaces the TinyMCE 4 editor bundled with WordPress with TinyMCE 8.

## Status

Early development (`0.1.0`). The plugin loads the bundled TinyMCE 8.10.0 in the classic
editor, the Gutenberg Classic block, the classic Text widget, and `wp_editor()`, and keeps
the TinyMCE 4 settings and APIs that core still uses working through `compat4x`.

WordPress's own TinyMCE plugins (`wordpress`, `wplink`, `wpeditimage`, `wpview`,
`wptextpattern`, `wpautoresize`, `wpdialogs`, `wpgallery`, `wpemoji`) are not ported yet, so
some editor features are missing:

- Add Media in the toolbar, the "More" tag, and the "Toolbar toggle" button
- The inline link and image toolbars, and embed previews
- Autoresize and Distraction Free Writing

Content is saved in the same HTML as before.

## Requirements

- WordPress 6.5 or later
- PHP 8.1 or later

## Installation

1. Copy the `editor-upgrade-for-tinymce` folder to `wp-content/plugins/`
2. Activate **Editor Upgrade for TinyMCE** in **Plugins**

No settings are needed. The plugin replaces the TinyMCE files WordPress loads and leaves
the rest of the editor setup alone.

## Development

The project uses [Bun](https://bun.sh) and
[`@wordpress/env`](https://developer.wordpress.org/block-editor/getting-started/devenv/).

```bash
bun install
bun run start
```

The site runs at <http://localhost:8888> (`admin` / `password`). The dev environment
installs the Classic Editor plugin so `post.php` uses TinyMCE.

### Scripts

| Script | What it does |
|---|---|
| `bun run start` / `stop` / `destroy` | Manage the wp-env site |
| `bun run shell` | Open a shell in the wp-env CLI container |
| `bun run lint` / `lint:fix` | Run PHPCS / PHPCBF |
| `bun run test:e2e` | Run the Playwright e2e suite |
| `bun run test:e2e:install` | Install the Chromium browser for Playwright |
| `bun run i18n` | Regenerate `languages/editor-upgrade-for-tinymce.pot` |
| `bun run bundle` | Build `build/editor-upgrade-for-tinymce.zip` |
| `bun run tinymce:update [version]` | Re-vendor TinyMCE from npm |

### Tests

`bun run test:e2e` starts wp-env if needed, logs in once, and checks that TinyMCE 8 boots
in the classic editor and in the Classic block, that Visual ↔ Code switching works, and
that the browser console stays clean.

Install the browser once with `bun run test:e2e:install`.

### Structure

- `editor-upgrade-for-tinymce.php` — plugin header, constants, bootstrap
- `includes/` — script replacement and editor settings
- `assets/js/compat4x.js` — TinyMCE 4 compatibility layer
- `assets/vendor/tinymce/` — vendored TinyMCE, pinned in `VERSION`
- `tests/e2e-pw/` — Playwright tests
- `docs/plan.md` — the full project plan

## License

GPLv2 or later. See [LICENSE](LICENSE).
