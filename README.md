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
- Autoresize, and the sticky toolbar on long posts

Content is saved in the same HTML as before, checked against output recorded from TinyMCE 4.

Plugin authors: see [MIGRATION.md](MIGRATION.md).

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
| `bun run test:e2e` | Run the Playwright e2e suite in Chromium |
| `bun run test:e2e:browsers` | Run it in Firefox and WebKit |
| `bun run test:compat:record` | Re-record `tests/compat/v4-results.json` from real TinyMCE 4 |
| `bun run test:e2e:install` | Install the Chromium browser for Playwright |
| `bun run i18n` | Regenerate `languages/editor-upgrade-for-tinymce.pot` |
| `bun run bundle` | Build `build/editor-upgrade-for-tinymce.zip` |
| `bun run tinymce:update [version]` | Re-vendor TinyMCE from npm |

### Tests

`bun run test:e2e` starts wp-env if needed, logs in once, and covers every editor surface:
the classic editor, the Classic block, the Text widget, the Customizer, and front-end
`wp_editor()`.

Most expected values are recorded from real TinyMCE 4, by running the same code with this
plugin deactivated: saved HTML (`tests/e2e-pw/utils/v4-baseline.ts`), the API
(`v4-api.json`, `v4-*-probe.ts`), and the fixture plugins in `tests/compat/plugins/`. The code
in `MIGRATION.md` also runs as a test.

Install the browser once with `bun run test:e2e:install`.

### Structure

- `editor-upgrade-for-tinymce.php` — plugin header, constants, bootstrap
- `includes/` — script replacement and editor settings
- `assets/js/compat4x.js` — TinyMCE 4 compatibility layer
- `assets/vendor/tinymce/` — vendored TinyMCE, pinned in `VERSION`
- `assets/css/editor.css` — overrides for the TinyMCE 8 chrome
- `tests/e2e-pw/` — Playwright tests (`specs/`, `utils/`) and a test-only mu-plugin
- `tests/compat/` — compatibility fixture plugins and their recorded TinyMCE 4 output
- `MIGRATION.md` — guide for plugin authors
- `docs/plan.md` — the full project plan

## License

GPLv2 or later. See [LICENSE](LICENSE).
