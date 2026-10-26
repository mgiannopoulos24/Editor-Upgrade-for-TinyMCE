# Migrating WordPress from TinyMCE 4.9.11 to TinyMCE 8.x

**Status:** Plugin-first project. The primary deliverable is a standalone plugin. Core integration is a long-term, conditional goal: Trac #47218 was closed as `wontfix` in June 2025 (see Section 2.4).  
**Target tree:** `wordpress-develop`, branch `trunk`, HEAD `5be81f3e34`  
**Target core state:** WordPress 7.2-beta1 (`$wp_version = '7.2-beta1-64606-src'`)  
**Current editor:** TinyMCE 4.9.11 (2020-07-13), `$tinymce_version = '49110-20250317'`  
**Proposed editor:** TinyMCE 8.x, pinned to 8.10.0 at the start of the project  
**Date:** 2026-10-25  
**Related:** [Trac #47218](https://core.trac.wordpress.org/ticket/47218), [Gutenberg #78067](https://github.com/WordPress/gutenberg/issues/78067)

> **Bottom line:** WordPress should migrate, but it must not do so as a single “swap the vendor folder” commit. TinyMCE 4 has been end-of-life since 31 December 2020. TinyMCE 8 is a different editor architecture: new theme, new skin, new UI API, new dialog schema, new sanitization, new licensing, and many removed plugins. A direct upgrade will break a meaningful share of the plugin ecosystem and parts of WordPress’s own editor integration. The only responsible path is a staged, feature-plugin-first migration with an in-house `compat4x` bridge, followed by a native port of WordPress’s own code and a long ecosystem beta.
>
> **Core maintainers have declined a core upgrade for now** (Trac #47218, `wontfix`, June 2025) and explicitly pointed to a plugin instead. This project therefore ships as a plugin first and on its own merits. A core merge is proposed only later, if the plugin's results give maintainers a reason to reopen #47218.

---

## 0. How to read this document

This plan is deliberately written in the order a core contributor, a plugin author, and a release lead would need it:

1. **Sections 1–3** state the recommendation and the risk honestly.
2. **Sections 4–5** audit what exists today and enumerate the TinyMCE 4 → 8 breaking changes.
3. **Sections 6–7** describe the target architecture and the compatibility layer.
4. **Sections 8–10** give the phased execution plan, file-by-file work, and test strategy.
5. **Sections 11–16** cover ecosystem rollout, security, performance, accessibility, i18n, risks, effort, and open decisions.
6. **Appendices A–F** are reference tables for implementers.

The plan does **not** modify core code. It is a proposal and an execution guide.

---

## 1. Executive summary

### 1.1 Recommendation

Adopt a **three-stage migration**. Stage A is the committed deliverable and is useful on its own. Stages B and C happen only if core maintainers agree to reopen #47218 based on Stage A's results (Section 2.4).

| Stage | What ships | Purpose | Approximate duration |
|---|---|---|---|
| **A. Plugin (committed)** | A standalone `wordpress-tinymce-8` plugin on WordPress.org bundling TinyMCE 8.10.x and an in-house `compat4x` plugin | Give sites and plugin authors (bbPress, ACF, custom fields, front-end editors) a supported editor today; collect compatibility data | 6–9 months |
| **B. Core integration (conditional)** | Native port of WordPress’s PHP, JS, CSS, and nine bundled TinyMCE plugins to the v8 API; `compat4x` retained only as a third-party bridge | Make core independent of v4 internals; remove the shim from core’s own code paths | 4–6 months |
| **C. Ecosystem rollout (conditional)** | Core beta/RC, dev notes, compatibility tracker, rollback plugin | Absorb ecosystem fallout; ship only when the compatibility and quality gates pass | 3–6 months |

Total: **roughly 9–12 months with four regular contributors**, or 18–24 months with two. The effort is estimated at **80–100 person-weeks**, including contingency. This is not a drive-by patch.

### 1.2 Why migrate at all

- **Security:** TinyMCE 4.9.11 has received no upstream security fixes since 31 December 2020. WordPress currently ships a six-year-old editor engine in every classic editor, Classic block, widget, and `wp_editor()` call.
- **Browser compatibility:** v4 predates modern selection, IME, clipboard, shadow-DOM, and mobile browser behavior. WordPress is maintaining a frozen editor against a moving platform.
- **Maintenance cost:** WordPress’s own editor code is written against v4 internals (`tinymce.ui.*`, `editor.theme.panel`, `.mce-*` DOM, `editor.settings`, `tinymce.$`, `Env.ie`). Every year of delay makes the eventual port larger.
- **Ecosystem direction:** Plugin authors have been writing against TinyMCE 5/6/7/8 APIs for years. The v4 knowledge base is shrinking.
- **Licensing:** TinyMCE 8 is GPLv2-or-later (or commercial). That is compatible with WordPress’s GPLv2-or-later licensing, provided the self-hosted `license_key: 'gpl'` is set. TinyMCE 4 was LGPL 2.1; the license change is real but not a blocker for core.
- **Precedent:** WordPress 7.2 already stopped registering the monolithic `wp-tinymce.js` bundle and loads the core, compatibility plugin, and lists plugin as separate files. The packaging boundary has already moved; this is the moment to finish the job.

### 1.3 Why not just stay on v4

Staying on v4 is a decision to own a fork of an EOL editor. That means:

- backporting security fixes without upstream support;
- debugging browser regressions alone;
- maintaining v4’s jQuery-era UI and IE branches forever;
- telling plugin authors that the modern TinyMCE API is unavailable;
- accumulating more WordPress-specific code against APIs that no longer exist upstream.

A short-term security-only fork may be justified as a contingency, but it is not a migration strategy.

### 1.4 Why not jump to v5, v6, or v7 first

TinyMCE 5, 6, and 7 are also past their support windows for the relevant release lines, and each intermediate upgrade would repeat the same integration work. The official migration guidance is cumulative: the 4 → 8 guide covers the 5, 6, 7, and 8 breaking changes in one document. Going directly to 8 avoids two or three partial migrations and lands on the current GPL release line.

### 1.5 The non-negotiable constraint

**WordPress cannot ship both TinyMCE 4 and TinyMCE 8 in core as the default editor.** Two editors means two bootstrap paths, two sets of plugins, two CSS systems, and an impossible support matrix. The feature plugin is the opt-in bridge; core ships one editor.

---

## 2. The honest case: this will break plugins and editor behavior

Many people have said, correctly, that a TinyMCE 8 upgrade will break plugins and change editor behavior. This plan does not dispute that. It assumes it.

### 2.1 What “break” means

A plugin is at risk if it does any of the following:

| Plugin behavior | Why it breaks |
|---|---|
| Calls `editor.addButton()` or `editor.addMenuItem()` | Removed from the v8 editor instance. The replacement is `editor.ui.registry.addButton()` / `addMenuItem()`. |
| Calls `editor.theme.panel`, `tinymce.ui.Factory`, `tinymce.ui.Control`, `tinymce.ui.FloatPanel` | The v4 UI framework is gone. v8 uses the silver theme and the UI registry. There is no general-purpose replacement for arbitrary v4 controls. |
| Uses `editor.settings` | Removed. v8 uses `editor.options.get()` (`editor.getParam()` still exists but is deprecated). |
| Uses `tinymce.$` or `editor.$` as a DOM helper | Removed from v8 core. WordPress can provide jQuery as a bridge, but third-party code cannot assume it. |
| Uses `tinymce.Env.ie`, `Env.iOS`, `Env.mac`, `Env.webkit`, `Env.gecko` | Removed as direct properties. v8 exposes `Env.browser.isIE()`, `Env.os.isiOS()`, `Env.os.isMacOS()`, and device-type helpers. |
| Uses `tinymce.isIE`, `tinymce.isWebKit`, `tinymce.isGecko`, `tinymce.isMac` | Removed. |
| Uses `tinymce.editors` | Removed. Use `tinymce.EditorManager.get()` or `tinymce.get()`. |
| Uses `tinymce.util.XHR`, `Promise`, `JSON`, `JSONRequest`, `JSONP` | Removed. Use `fetch`, native `Promise`, and `JSON`. |
| Uses `tinymce.html.SaxParser` | Removed. `DomParser` and `Serializer` remain, but the streaming SAX API does not. |
| Calls `editor.windowManager.open({ items, buttons, onsubmit })` | `windowManager.open()` still exists, but the v4 item/button schema is not accepted. v8 uses a panel/component schema with `onSubmit`, `onCancel`, and `api.getData()`. |
| Registers `paste`, `tabfocus`, `textpattern`, `hr`, `colorpicker`, `textcolor`, `contextmenu`, `noneditable`, or `nonbreaking` as separate plugins | These were merged into core or removed. Registering them can produce load errors or unknown-plugin warnings. |
| Registers `fullpage`, `spellchecker`, `template`, `imagetools`, `toc`, or `colorpicker` | Removed, premium-only, or replaced. |
| Uses `formatselect`, `styleselect`, `fontselect`, or `fontsizeselect` in a toolbar | Renamed to `blocks`, `styles`, `fontfamily`, and `fontsize`. |
| Uses `pastetext` as a toolbar button | Not a v8 toolbar button. The `mceTogglePlainTextPaste` command and `paste_as_text` option still exist; a custom button or plugin is required. |
| Sets `forced_root_block: false` | Invalid in v8. The option must be a non-empty string. |
| Sets `resize: 'vertical'` | Invalid. v8 accepts `true` or `'both'` (and `false`). |
| Sets `rtl_ui` | Removed. Use `directionality` and the skin’s RTL support. |
| Relies on `.mce-tinymce`, `.mce-toolbar-grp`, `.mce-edit-area`, `.mce-statusbar`, `.mce-floatpanel`, `.mce-window`, `.mce-menu`, `.mce-btn`, or `.mce-i-*` for layout | v8 uses `.tox-*` classes. Some `.mce-*` classes remain in content (for example `.mce-content-body`, `.mce-item-table`, `.mce-shim`), but the editor chrome is `.tox-*`. |
| Uses `editor.fire()` with custom events | `fire()` still exists but is deprecated in v8 and will be removed in v9. Use `dispatch()`. |
| Uses `editor.selection.setContent()` | Deprecated in v8 and will be removed in v9. Use `editor.insertContent()`. |
| Uses `editor.documentBaseUrl` | Removed. Use `editor.editorManager.documentBaseURI.getURI()`. |
| Uses `editor.on('PastePreProcess')` with v4 paste options | The event still exists; many `paste_*` options were removed or changed. |
| Uses `media_url_resolver` with `resolve`/`reject` callbacks | v8 requires a Promise-returning resolver. |
| Uses `table_responsive_width` | Replaced by `table_sizing_mode`. |
| Uses `remove_trailing_brs` on `DomParser` | Removed in v7. |
| Uses `force_hex_color` | Removed in v7. |
| Depends on the old split-button DOM | v8 split buttons render as two distinct components. Custom CSS may break. |
| Depends on HTML comments containing tags, conditional comments, or HTML-like attribute values | v8 enables DOMPurify’s `SAFE_FOR_XML`, which is stricter and may strip them. |
| Inserts untrusted iframes or `<object>`/`<embed>` | v8 defaults `sandbox_iframes` and `convert_unsafe_embeds` to `true`, changing preview and output behavior. |

### 2.2 What `compat4x` can and cannot fix

`compat4x` is worth building, but it is not a time machine.

**It can realistically provide:**

- `editor.addButton` / `editor.addMenuItem` shims that translate common button and menu specs to `editor.ui.registry.*`;
- `editor.buttons` / `editor.menuItems` compatibility objects;
- `editor.settings` as a proxy over `editor.options.get()`;
- `tinymce.$` / `editor.$` backed by WordPress’s jQuery;
- legacy `Env` aliases (`ie`, `iOS`, `mac`, `webkit`, `gecko`);
- `tinymce.isIE`, `isWebKit`, `isGecko`, `isMac`;
- `tinymce.editors` as a getter over `EditorManager.get()`;
- `tinymce.util.XHR`, `Promise`, `JSON`, `JSONRequest`, and `JSONP` shims;
- a `windowManager.open()` adapter for the common v4 `items`/`buttons` schema;
- `FloatPanel.hideAll()` as a best-effort popup closer;
- no-op registrations for removed plugin names so legacy plugin lists do not 404;
- legacy `.mce-*` classes on the v8 chrome for transitional CSS.

**It cannot realistically provide:**

- a full reimplementation of `tinymce.ui.Factory`, `Control`, `Container`, `Panel`, `ListBox`, `TextBox`, `ColorButton`, and the rest of the v4 UI framework;
- exact v4 DOM structure or CSS behavior;
- exact v4 parser/serializer behavior;
- exact v4 paste, text-pattern, or selection semantics;
- compatibility with plugins that depend on private v4 internals, monkey-patch editor methods, or replace the theme;
- compatibility with plugins that ship their own v4 theme, skin, or UI controls.

**Therefore:** any plugin that builds custom TinyMCE UI beyond simple toolbar buttons will likely need changes. The plan’s job is to make that set as small as possible, document it clearly, and give authors time to migrate.

### 2.3 What will change for users even when nothing “breaks”

- The editor chrome will look different: silver theme, oxide skin, different toolbar spacing, icons, menus, and dialogs.
- The toolbar may wrap, scroll, or collapse differently at narrow widths.
- The “kitchen sink” (`wp_adv`) behavior may change from a second row to a toolbar drawer, depending on the chosen implementation.
- The link, image, and media dialogs will use v8 dialog chrome or WordPress modals instead of v4 windows.
- Some HTML may serialize differently (`<br>` vs `<br />`, attribute order, comment handling, iframe sandboxing).
- The editor’s iframe content styles will be rebuilt; some theme/plugin editor styles may need updates.
- The status bar, resize handle, and fullscreen behavior may differ.
- Mobile and RTL layouts need dedicated QA; they are not free.

### 2.4 The official WordPress position

Trac #47218, “Update TinyMCE to version 5.x/6.x”, was opened in 2019 and closed as **`wontfix`** in June 2025. The closing rationale is essentially: a full upgrade is plugin territory, the classic editor is in deep maintenance, and full backward compatibility is likely impossible.

The canonical effort estimate is in comment:7 by azaozz: form a team of TinyMCE plugin authors, build an in-house `compat4x` plugin, ship a feature plugin, and test broadly. Comment:48 acknowledges that full back-compat is unlikely.

Gutenberg #78067 explored deprecating the Classic block and TinyMCE. That plan was reverted; the Classic block and TinyMCE remain required. That means the block editor is not an escape hatch: WordPress still needs a supported classic editor for the foreseeable future.

The closing comments (comment:45 by desrosj, comment:47 by jorbin, comment:48 by azaozz) give these reasons:

- it is not among the project's current priorities;
- the block editor does not use TinyMCE, and the classic editor has not been the default for about seven years, so default WordPress would not benefit;
- full backward compatibility is likely impossible;
- "this is squarely in plugin territory": a plugin can replace the bundled library and other plugins can then use it.

comment:45 also says the ticket "can be reopened in the future if surrounding circumstances change", and that discussion can continue on the closed ticket. Duplicates are still being closed against it (#63300, #65906, #65954 as of August 2026).

**Prior art:** ClassicPress-Editor, a plugin that attempted a TinyMCE 5/6 upgrade (mentioned in comment:18 and comment:24). Its original repository is gone; a fork remains at <https://github.com/Pross/ClassicPress-Editor> (last push 2021). Its author reported that it was "mostly working" but stalled on UI compromises and a lack of JS help and testers. Review it before Phase 1.

**Implication:**

1. Ship the plugin as the product. It must be worth installing even if core never merges it.
2. Do not ask for #47218 to be reopened until the plugin has passed its exit criteria (Section 6.10) and has real users and compatibility data. That evidence is the "changed circumstances" comment:45 asks for.
3. Keep the ticket informed with short, non-demanding progress comments that link to the plugin repository.
4. Do not open new Trac tickets for the upgrade itself; they will be closed as duplicates of #47218.

---

## 3. Scope

### 3.1 In scope

- TinyMCE core, theme, skin, icons, models, and bundled plugins in `src/js/_enqueues/vendor/tinymce/`.
- WordPress’s nine custom TinyMCE plugins:
  - `wordpress`
  - `wpautoresize`
  - `wpdialogs`
  - `wpeditimage`
  - `wpemoji`
  - `wpgallery`
  - `wplink`
  - `wptextpattern`
  - `wpview`
- PHP integration:
  - `src/wp-includes/class-wp-editor.php`
  - `src/wp-includes/script-loader.php`
  - `src/wp-includes/functions.php`
  - `src/wp-includes/version.php`
  - `src/wp-admin/includes/update-core.php`
  - `src/wp-includes/js/tinymce/wp-tinymce.php`
- JavaScript integration:
  - `src/js/_enqueues/wp/editor/base.js`
  - `src/js/_enqueues/wp/editor/dfw.js`
  - `src/js/_enqueues/wp/mce-view.js`
  - `src/js/_enqueues/wp/widgets/text.js`
  - `src/js/_enqueues/wp/media/editor.js`
  - `src/js/_enqueues/wp/customize/controls.js`
  - `src/js/_enqueues/admin/post.js`
- CSS integration:
  - `src/wp-includes/css/editor.css`
  - `src/wp-admin/css/edit.css`
  - `src/wp-admin/css/customize-widgets.css`
  - theme editor styles that reference `.mce-*`
- Gutenberg’s Classic block (`core/freeform`), in coordination with the Gutenberg repository.
- Build system, tests, i18n, documentation, and rollout.

### 3.2 Out of scope

- Replacing TinyMCE with another editor (Block editor, ProseMirror, Lexical, etc.).
- Removing the Classic editor or Classic block.
- Redesigning the WordPress editor UX beyond what v8 requires.
- Upgrading QuickTags.
- Rewriting third-party plugins. We provide compatibility and guidance; we do not fix them.
- Internet Explorer 11 support. TinyMCE 8 does not support it, and WordPress’s browser policy does not require it.
- A dark-mode WordPress admin theme. Oxide-dark exists, but core does not ship an admin dark mode in this project.
- A custom TinyMCE skin built from scratch. We will use oxide plus WordPress CSS overrides unless a skin spike proves otherwise.

### 3.3 Supported versions

- **Feature plugin:** WordPress 7.0+ (practical floor; adjust after testing), PHP 7.2+.
- **Core integration:** `trunk`, targeting the next feasible major release after the ecosystem beta.
- **Browsers:** current Chrome, Firefox, Safari, Edge; mobile Safari and Chrome. No IE.
- **TinyMCE:** pin to a minor line (8.10.x) for the project; do not float across minors. Upgrade to 8.11+ only after a regression pass.
- **Gutenberg:** the version bundled in the target core release, plus the current Gutenberg plugin for at least one cycle.

---

## 4. Current-state audit

### 4.1 Repository snapshot

| Item | Value |
|---|---|
| Branch | `trunk` |
| HEAD | `5be81f3e34` — “Code Quality: Remove a redundant `is_wp_error()` check after uploading a plugin or theme.” |
| WordPress version | `7.2-beta1-64606-src` |
| TinyMCE version | `4.9.11` (release date 2020-07-13) |
| `$tinymce_version` | `49110-20250317` |
| Working tree | Clean at the time of the audit |
| Bundled TinyMCE size | ~3.4 MB in `src/js/_enqueues/vendor/tinymce/` |
| Build output | `src/wp-includes/js/tinymce/` (generated by Grunt) |

TinyMCE 4.9.11 reached end-of-life on **31 December 2020**. WordPress has shipped it for more than five years after upstream support ended.

### 4.2 Bundled asset inventory (v4)

`src/js/_enqueues/vendor/tinymce/` contains:

- `tinymce.js` (~960 KB) and `tinymce.min.js` (~357 KB);
- `themes/modern/` and `themes/inlite/`;
- `skins/lightgray/` (fonts and images) and `skins/wordpress/` (WordPress content styles);
- 22 plugin directories:
  `charmap`, `colorpicker`, `compat3x`, `directionality`, `fullscreen`, `hr`, `image`, `link`, `lists`, `media`, `paste`, `tabfocus`, `textcolor`, `wordpress`, `wpautoresize`, `wpdialogs`, `wpeditimage`, `wpemoji`, `wpgallery`, `wplink`, `wptextpattern`, `wpview`;
- `langs/wp-langs-en.js`;
- `utils/` (legacy popup helpers);
- `wp-tinymce.php` (back-compat loader, not used by core since 5.1);
- `license.txt` and `tiny_mce_popup.js`.

The directory structure is v4-specific. v8 has no `themes/modern`, no `themes/inlite`, no `skins/lightgray`, and no `compat3x`.

### 4.3 PHP integration points

| File | Symbol | Role | v8 impact |
|---|---|---|---|
| `src/wp-includes/class-wp-editor.php` | `WP_Editor::default_settings()` | Default TinyMCE settings: `theme: modern`, `skin: lightgray`, `resize: vertical`, `content_css` pointing at v4 skin, `entity_encoding: raw`, `keep_styles: false` | Must remove/replace `theme`, `skin`, `resize`, `content_css`; add `license_key`, `promotion`, `element_format` decision. |
| `src/wp-includes/class-wp-editor.php` | `WP_Editor::_parse_init()` | Serializes PHP settings to JS | Mostly unchanged; must handle booleans/strings safely. |
| `src/wp-includes/class-wp-editor.php` | `WP_Editor::editor_js()` | Prints `tinyMCEPreInit`, initializes editors, uses `tinymce.$` and `tinymce.Env.ie` | Replace `tinymce.$` with jQuery, remove IE branch; keep `tinyMCEPreInit` shape. |
| `src/wp-includes/class-wp-editor.php` | `WP_Editor::print_default_editor_scripts()` | Prints default settings for `wp.editor.getDefaultSettings()`, hardcoded plugin list | Update plugin list and `tinyMCEPreInit`; remove v4-only plugins. |
| `src/wp-includes/class-wp-editor.php` | `WP_Editor::wp_mce_translation()` | Emits `tinymce.addI18n()` and marks language file done | Keep `addI18n`/`ScriptLoader.markDone`; audit strings; migrate locale filenames to RFC5646. |
| `src/wp-includes/class-wp-editor.php` | `WP_Editor::print_tinymce_scripts()` | Prints `wp-tinymce` handle + translations | Update handle contents. |
| `src/wp-includes/class-wp-editor.php` | `WP_Editor::force_uncompressed_tinymce()` | Re-registers scripts when a custom theme is used | v8 has no `theme_url` custom theme in the v4 sense; rethink or remove. |
| `src/wp-includes/class-wp-editor.php` | `WP_Editor::enqueue_default_editor()` | Enqueues editor assets | Update dependencies and handle names. |
| `src/wp-includes/class-wp-editor.php` | Plugin/button lists | Normal and teeny plugin lists; `mce_buttons` 1–4 | Remove v4-only plugins; map renamed buttons; add v8 replacements. |
| `src/wp-includes/script-loader.php` | `wp_register_tinymce_scripts()` | Registers `wp-tinymce-root`, `wp-tinymce` (compat3x), `wp-tinymce-lists` | Point root at v8; point `wp-tinymce` at `compat4x`; keep lists. |
| `src/wp-includes/script-loader.php` | `wp_tinymce_inline_scripts()` | Builds Classic block settings and `wpEditorL10n` | Update plugin/button lists; keep `classic_block_editor` flag. |
| `src/wp-includes/functions.php` | `_mce_set_direction()` | Adds `directionality`, `rtl_ui`, and `ltr` button for RTL locales | Remove `rtl_ui`; keep `directionality`; ensure `ltr` button exists. |
| `src/wp-includes/version.php` | `$tinymce_version` | Cache-busting version string | Update to the v8 version and packaging date. |
| `src/wp-admin/includes/update-core.php` | `$_old_files` | Removes obsolete files on upgrade | Add v4-only themes, skins, plugins, and helpers. |
| `src/wp-includes/js/tinymce/wp-tinymce.php` | Back-compat loader | Serves `wp-tinymce.js` or `tinymce.min.js` + `compat3x` | Update to v8 + `compat4x` or deprecate/remove. |

### 4.4 JavaScript integration points

| File | TinyMCE/v4 APIs used | Risk | Notes |
|---|---|---|---|
| `src/js/_enqueues/wp/editor/base.js` (~1,508 lines) | `tinymce.$`, `tinymce.Env.iOS`, `.mce-toolbar-grp`, `.mce_SELRES_*`, `editor.theme.resizeTo`, `tinymce.get()`, `tinymce.init()`, `tinymce.translate()`, `wp-before-tinymce-init` / `tinymce-editor-init` events | High | Core `wp.editor.initialize/remove/getContent` and `switchEditors` live here. Must preserve the public API. |
| `src/js/_enqueues/wp/editor/dfw.js` (~1,636 lines) | `tinymce.util.VK`, `tinymce.ui.FloatPanel.hideAll()`, `.mce-floatpanel`, `.mce-toolbar-grp`, `.mce-edit-area`, `.mce-statusbar`, `.mce-menubar`, `theme.resizeTo` | High | Distraction-free writing is tightly coupled to v4 chrome. |
| `src/js/_enqueues/wp/mce-view.js` (~1,000 lines) | `tinymce.editors`, `tinymce.html.Schema/DomParser/Serializer`, `tinymce.DOM.decode`, `tinymce.Env.ie`, `skins/lightgray/content.min.css` | Medium | WP view API; parser/serializer still exist in v8, but `editors` and `Env.ie` do not. |
| `src/js/_enqueues/wp/widgets/text.js` (~552 lines) | `tinymce.get()`, `tinymce.activeEditor`, `wp.editor.initialize`, `wp-before-tinymce-init` event, `isHidden()` | Medium | Text widget editor lifecycle. |
| `src/js/_enqueues/wp/media/editor.js` (~1,079 lines) | `tinymce.activeEditor`, `tinymce.get()`, `wpActiveEditor` | Medium | Media modal integration; mostly public APIs. |
| `src/js/_enqueues/wp/customize/controls.js` (~9,524 lines) | `tinymce.ui.FloatPanel.zIndex` | Low | One line; replace with CSS or remove. |
| `src/js/_enqueues/admin/post.js` | `.mce-toolbar-grp` | Low | Sticky/scroll behavior; update selector. |

### 4.5 WordPress TinyMCE plugins inventory

Line counts are from the v4 sources. “v4 API density” is a rough indicator of port effort, not a precise metric.

| Plugin | Lines | Purpose | v4-specific APIs | v8 impact | Port strategy |
|---|---:|---|---|---|---|
| `wordpress` | 1,206 | Core WP integration: custom buttons, commands, shortcuts, help dialog, `wp_adv`, `dfw`, `wp_more`, `wp_page`, `wp_code`, `wp_add_media`, `wp_help`, `wp_fullscreen`; custom floating toolbar factory | `editor.addButton` (6), `editor.addMenuItem` (3), `tinymce.ui.Factory`, `editor.theme.panel` (5), `editor.buttons`, `editor.settings` (8), `tinymce.$` (5), `Env.*` (18), `editor.windowManager`, `editor.fire('wptoolbar')` | **Very high** | Rewrite button/menu registration to `editor.ui.registry.*`; replace custom toolbar with `addContextToolbar`/`addContextForm` or a WP-owned DOM toolbar; replace `editor.settings` with `editor.options.get()` (register WP options with `editor.options.register()`); replace `fire` with `dispatch`; audit every `Env` use. |
| `wpautoresize` | 207 | Auto-resize the editor iframe; DFW height handling | `editor.theme.resizeTo`, `editor.settings` (2), `Env.*` (2), `editor.getDoc`, `editor.on('init')` | **High** | Either adopt v8 `autoresize` or port to container-height helpers; remove `theme.resizeTo`. |
| `wpdialogs` | 92 | Wraps `editor.windowManager.open()` in jQuery UI dialogs; `tinymce.WPWindowManager` | `editor.windowManager` (3) | **High** | Drop from default list. Keep an opt-in adapter for third-party plugins that call `wpDialog`; core uses v8 native dialogs or WP modals. |
| `wpeditimage` | 900 | Image/caption editing; `wp.media` integration; image toolbar | `editor.addButton` (3), `tinymce.html.Serializer`, `editor.parser.parse`, `editor.dom`, `editor.selection`, `wp.media`, `editor.fire('wptoolbar')`, `Env.*` (4) | **High** | Port to `editor.ui.registry` and context toolbar; keep `wp.media`; verify `parser.parse(..., { forced_root_block: false })` on v8; replace `fire`. |
| `wpemoji` | 134 | Emoji rendering in editor content | Minimal; `editor.on('init')`, `editor.getDoc`, `editor.dom` | **Low** | Mostly unchanged; test content CSS and `wp.emoji` timing. |
| `wpgallery` | 112 | Gallery editing via `wp.media` | `editor.dom`, `editor.selection`, `wp.media`, `Env.*` (1) | **Medium** | Port event handling and selection APIs; keep `wp.media`. |
| `wplink` | 615 | Link insertion/editing; inline link preview/input; `wpLink` integration | `tinymce.ui.Factory.add` (2), `tinymce.ui.Control.extend`, `editor.addButton` (8), `editor.addMenuItem` (1), `editor.windowManager`, `editor.fire('wptoolbar')`, `tinymce.$` (2), `Env.*` (3) | **Very high** | Replace custom UI controls with `addContextForm` or a WP-owned DOM control; use `wpLink` modal for full editing; port buttons/menu items; remove `fire`. |
| `wptextpattern` | 348 | WordPress text patterns (headings, lists, blockquote, hr, code) on Enter/Space | `editor.settings.wptextpattern` (1), `editor.on('keydown')`, `editor.formatter`, `editor.selection`, `editor.undoManager`, `Env.*` (1) | **Medium–high** | Either port patterns to v8 `text_patterns` with `trigger: 'enter'` and delete the plugin, or keep the plugin and set `text_patterns: false`. Spike both. |
| `wpview` | 225 | Renders embedded views (embed, gallery, audio, video, playlists) in the editor | `editor.dom`, `editor.getBody`, `tinymce.html.*`, `editor.fire('wptoolbar')` (2), `wp.mce.views` | **Medium** | Keep parser/serializer; port toolbar to context toolbar; replace `fire`; test embed previews under iframe sandboxing. |

### 4.6 CSS surface

`src/wp-includes/css/editor.css` is ~1,873 lines with **298 `.mce-*` matches**. The highest-frequency selectors are:

| Selector | Matches | v8 equivalent |
|---|---:|---|
| `.mce-btn` | 60 | `.tox-tbtn` |
| `.mce-toolbar` | 55 | `.tox-toolbar` |
| `.mce-window` | 40 | `.tox-dialog` |
| `.mce-menu` | 31 | `.tox-menu` |
| `.mce-btn-group` | 30 | `.tox-toolbar__group` |
| `.mce-menu-item` | 25 | `.tox-collection__item` |
| `.mce-inline-toolbar-grp` | 21 | `.tox-pop` / context toolbar |
| `.mce-primary` | 18 | `.tox-button--primary` |
| `.mce-active` | 16 | `.tox-tbtn--enabled` / `aria-pressed` |
| `.mce-caret` | 13 | `.tox-caret` |
| `.mce-ico` | 10 | `.tox-icon` |
| `.mce-window-head` | 9 | `.tox-dialog__header` |
| `.mce-disabled` | 9 | `[disabled]` / `.tox-tbtn--disabled` |
| `.mce-close` | 9 | `.tox-dialog__close` |
| `.mce-listbox` | 7 | `.tox-listbox` |
| `.mce-toolbar-grp` | 6 | `.tox-editor-header` / `.tox-toolbar-overlord` |
| `.mce-menubar` | 6 | `.tox-menubar` |
| `.mce-floatpanel` | 3 | `.tox-pop` / `.tox-dialog` |
| `.mce-statusbar` | 4 | `.tox-statusbar` |
| `.mce-edit-area` | — | `.tox-edit-area` |

`src/wp-admin/css/edit.css` adds 10 `.mce-*` matches, `src/wp-admin/css/customize-widgets.css` adds 2, and core themes reference `.mce-item-table` / `.mce-content-body` in editor styles. These are smaller but still need a pass.

**Key insight:** WordPress should stop styling TinyMCE’s internal DOM wherever possible. Use WordPress-owned wrapper classes (`.wp-editor-wrap`, `.wp-editor-tools`, `.wp-editor-area`, `.wp-media-buttons`) for layout, and a small, documented set of stable v8 selectors for the rest. This reduces the next upgrade from 298 selector rewrites to a handful.

### 4.7 Gutenberg Classic block

The Classic block (`core/freeform`) is the only block-editor consumer of TinyMCE. At the pinned Gutenberg SHA `be6a50be6834e922b9db12c75c9a2cd817b2db59`:

- `packages/block-library/src/freeform/modal.jsx` reads `window.wpEditorL10n.tinymce`, calls `tinymce.EditorManager.overrideDefaults({ baseURL, suffix })`, and uses `wp.oldEditor.initialize/remove/getContent`.
- `packages/block-library/src/freeform/editor.scss` styles `.mce-edit-area`, `.mce-tinymce`, and `.mce-container-body`.

v8 still supports `EditorManager.overrideDefaults()`, `tinyMCEPreInit.baseURL/suffix`, and `wp.oldEditor`. The CSS selectors do not exist in v8 chrome. A Gutenberg PR is required; core cannot fix Gutenberg’s stylesheet from `wordpress-develop`.

### 4.8 Build system

`Gruntfile.js` currently:

- copies `src/js/_enqueues/vendor/tinymce/**` to `src/wp-includes/js/tinymce/`, excluding `tinymce/tinymce.js`, then copies `tinymce.js` separately for `/src`;
- runs `uglify:core` on `wp-includes/js/tinymce/plugins/wordpress/plugin.js` and `wp-includes/js/tinymce/plugins/wp*/plugin.js`;
- runs `concat:tinymce`, concatenating `tinymce.min.js`, `themes/modern/theme.min.js`, and `plugins/*/plugin.min.js` into `wp-tinymce.js`;
- runs `concat:tinymce` as part of `build:js`.

WordPress 7.2 no longer registers `wp-tinymce.js`, but the build still produces it. v8 makes the concat task obsolete: the v8 runtime expects its own theme/skin/model/icon files, and concatenating them is not a supported loading strategy.

### 4.9 Test coverage today

| Test | What it covers | Required change |
|---|---|---|
| `tests/phpunit/tests/editor/wpTinyMceInlineScripts.php` | Classic block inline settings | Update plugin/button expectations. |
| `tests/phpunit/tests/dependencies/scripts.php` | TinyMCE script registration; asserts `compat3x` path | Update to `compat4x`; assert v8 root and lists. |
| `tests/phpunit/tests/functions/mceSetDirection.php` | `_mce_set_direction()` expects `rtl_ui` | Remove `rtl_ui` expectation; assert `directionality` and `ltr`. |
| `tests/qunit/wp-includes/js/tinymce/tinymce-obsolete.js` | Tests removed v4 APIs | Rewrite as `compat4x` tests, or replace with v8 API tests. |
| `tests/qunit/wp-includes/js/tinymce/plugins/wptextpattern/plugin.js` | Text pattern behavior | Update for the chosen pattern strategy. |
| `tests/e2e/specs/edit-posts.test.js` | Post editing | Add classic editor/Classic block coverage. |
| `tests/visual-regression/specs/visual-snapshots.test.js` | Visual snapshots | Add editor, toolbar, dialog, RTL, and content snapshots. |

There is no comprehensive content round-trip corpus for the editor. This project needs one.

### 4.10 Third-party ecosystem assumptions

WordPress exposes these TinyMCE integration points to plugins and themes:

- `tiny_mce_before_init`
- `tiny_mce_plugins`
- `teeny_mce_plugins`
- `mce_buttons`, `mce_buttons_2`, `mce_buttons_3`, `mce_buttons_4`
- `teeny_mce_buttons`
- `mce_external_plugins`
- `mce_external_languages`
- `mce_css`
- `wp_editor_settings`
- `wp_mce_translation`
- `before_wp_tiny_mce`, `wp_tiny_mce_init`, `after_wp_tiny_mce`
- JS events `wp-before-tinymce-init`, `tinymce-editor-setup`, `tinymce-editor-init`
- `wp.editor.initialize/remove/getContent`, `switchEditors`, `wpActiveEditor`, `tinyMCEPreInit`
- `wp.oldEditor` for the Classic block

These are public contracts. The migration must preserve them or provide a documented, deprecation-cycled replacement.

---

## 5. TinyMCE 4 → 8 breaking-change matrix

This section is the reference implementers will return to. It is organized by area, with the v4 behavior, the v8 behavior, the WordPress impact, and the required action.

### 5.1 Packaging and runtime loading

| Area | TinyMCE 4.9.11 | TinyMCE 8.10 | WordPress impact | Action |
|---|---|---|---|---|
| Core file | `tinymce.js` / `tinymce.min.js` | `tinymce.js` / `tinymce.min.js` | Same shape, different contents | Replace vendor tree. |
| Theme | `themes/modern`, `themes/inlite` | `themes/silver` | `theme: 'modern'` no longer valid | Remove `theme` or set `silver`. |
| Skin | `skins/lightgray`, custom `skins/wordpress` | `skins/ui/oxide`, `skins/ui/oxide-dark` | `skin: 'lightgray'` no longer valid | Use `oxide`; rebuild content CSS. |
| Icons | Font-based (`mce-i-*`, Dashicons classes) | SVG icon registry (`icons/default`) | WP buttons using `icon: 'dashicon ...'` do not render | Register SVG icons or use `text`; port WP icon map. |
| DOM model | Bundled in core | `models/dom/model.min.js` | Must be copied and loaded | Include `models/` in build. |
| Content skin | `skins/wordpress/wp-content.css` | `skins/content/default/content.css` plus custom CSS | WP content styles need a v8 base | Rebuild `wp-content.css` on top of v8 content styles. |
| Compatibility plugin | `plugins/compat3x` (3.x → 4.x) | None | `compat3x` is useless for v8 | Replace with in-house `compat4x`. |
| Bundle | `wp-tinymce.js` concatenated core + theme + plugins | No supported monolithic bundle | WP 7.2 already stopped registering the bundle | Remove `concat:tinymce`; load separate files. |
| Language files | `langs/{locale}.js`, `_dlg.js` | `langs/{RFC5646}.js` | WP uses underscore locales | Migrate to hyphenated filenames; drop `_dlg`. |
| Loader | `wp-tinymce.php` serves bundle or core + compat3x | Same file can serve core + compat4x | Back-compat only | Update or deprecate. |
| License | LGPL 2.1 | GPLv2+ or commercial | Compatible with WP GPLv2+ | Set `license_key: 'gpl'`; include license/notices. |

**Loading order in WordPress today:**

1. `wp-tinymce-root` → `tinymce.min.js`
2. `wp-tinymce` → `plugins/compat3x/plugin.min.js`
3. `wp-tinymce-lists` → `plugins/lists/plugin.min.js`
4. `tinyMCEPreInit` inline script
5. `tinymce.init()` per editor; TinyMCE loads theme, skin, and plugins from `baseURL`.

For v8, the order becomes:

1. `wp-tinymce-root` → `tinymce.min.js`
2. `wp-tinymce` → `plugins/compat4x/plugin.min.js`
3. `wp-tinymce-lists` → `plugins/lists/plugin.min.js`
4. `tinyMCEPreInit` inline script (still supported by v8: `baseURL`, `suffix`, `base`)
5. `tinymce.init()`; v8 loads `themes/silver`, `skins/ui/oxide`, `models/dom`, `icons/default`, and WP plugins from `baseURL`.

### 5.2 Themes, skins, and icons

| v4 | v8 | Notes |
|---|---|---|
| `theme: 'modern'` | `theme: 'silver'` (default) | Omit `theme` to use the default. |
| `theme: 'inlite'` | No equivalent | Inline mode is a configuration, not a theme. |
| `skin: 'lightgray'` | `skin: 'oxide'` or `'oxide-dark'` | WP should use `oxide`. |
| `skin_url` | `skin_url` still accepted | Point at `skins/ui/oxide`. |
| `content_css: '.../skins/wordpress/wp-content.css'` | `content_css` accepts `default`, `dark`, `document`, `writer`, `tinymce-5`, or URLs | WP should load a v8 content base plus its own CSS. |
| Font icons / Dashicons classes | SVG icon registry | `editor.ui.registry.addIcon(name, svg)`; `icon: 'name'`. |
| `.mce-*` chrome | `.tox-*` chrome | Content still uses some `.mce-*` classes. |
| Separate RTL skin | `[dir=rtl]` styles in the oxide skin | No separate RTL stylesheet. |

**Icon strategy.** WordPress’s custom buttons currently use Dashicons CSS classes, for example `icon: 'dashicon dashicons-wp_more'`. v8 button specs accept an `icon` name registered in the SVG registry, not an arbitrary CSS class. The migration needs a `wp-icons` module that registers SVG data for:

- `wp_more`, `wp_page`, `wp_help`, `wp_code`, `wp_adv`, `wp_add_media`, `wp_view`, `wp_image`, `wp_link`, `wp_kitchen_sink`, `wp_fullscreen`, `dfw`;
- standard actions where a v8 icon exists (`bold`, `italic`, `link`, `unlink`, `image`, `video`, `more`, `pagebreak`, `help`, `code`, `fullscreen`, `align*`, `undo`, `redo`, `removeformat`, `hr`, `pastetext`).

Options:

1. Copy the relevant SVG paths from the Dashicons source (GPL-compatible) into a WP icon module.
2. Reuse v8’s built-in icons for standard actions and only create custom SVGs for WP-specific ones.
3. Use `text` labels as a temporary fallback (worse UX; not recommended for release).

**Recommendation:** option 2 for standard actions plus option 1 for WP-specific icons. Keep a small compatibility map for third-party `dashicon` classes that can be translated to a registered SVG name; warn for unknown icons.

### 5.3 Initialization options

The following table covers the options WordPress sets or is likely to encounter through filters. “Verify” means the option exists in the v8 type definitions but its exact semantics or default should be confirmed in the Phase 1 spike.

| Option | v4 | v8 | WordPress action |
|---|---|---|---|
| `theme` | `modern` default | `silver` default | Remove from defaults or set `silver`. |
| `skin` | `lightgray` | `oxide` | Set `oxide`. |
| `skin_url` | Supported | Supported | Point at v8 skin. |
| `theme_url` | Supported | No v4-style custom theme | Remove `force_uncompressed_tinymce()` custom-theme logic or redefine it. |
| `plugins` | Comma/space list | Comma/space list | Remove merged/removed plugins; add v8 replacements. |
| `external_plugins` | Object of name → URL | Still supported | Keep; compat4x wraps registration. |
| `toolbar1`…`toolbar9` | Supported | Supported | Keep, but map button names. |
| `toolbar` | Alias / array | String or grouped array | Prefer one `toolbar` string with groups if using drawer mode. |
| `toolbar_mode` | Not present | `floating` (default), `sliding`, `scrolling`, `wrap` | Only works with a single toolbar, not `toolbar1..n`. Decide `wp_adv` strategy. |
| `toolbar_location` | Not present | `auto`, `top`, `bottom` | Not needed; keep default. |
| `toolbar_sticky` | Not present | Boolean | Consider for long posts; not required. |
| `menubar` | Boolean/string | Boolean/string | Keep `false`. |
| `menu` | Not present | Object | Not needed. |
| `branding` | Boolean | Boolean | Keep `false`. |
| `promotion` | Not present | Boolean | Set `false`; do not show TinyMCE upsells in core. |
| `resize` | `true`, `false`, `'vertical'`, `'both'` | `true`, `false`, `'both'` | Replace `'vertical'` with `true` or a custom vertical resize handle. |
| `statusbar` | Boolean | Boolean | Keep default/true; audit. |
| `elementpath` | Boolean | Boolean | Keep `false` where currently set. |
| `forced_root_block` | `false` allowed | Must be a non-empty string | Set `p`; reject `false`/`''` from filters with a warning. |
| `forced_root_block_attrs` | Object | Object | Keep. |
| `element_format` | `xhtml` default | `html` default | Set `xhtml` to preserve serialization, or accept and test a one-time content diff. |
| `entity_encoding` | `named` default | `named` default | WP already sets `raw`; keep. |
| `entities` | String | String | Keep. |
| `keep_styles` | Boolean | Boolean | Keep `false`. |
| `browser_spellcheck` | Boolean | Boolean | Keep `true`; replaces the removed `spellchecker` plugin. |
| `fix_list_elements` | Boolean | Boolean | Keep `true`. |
| `preview_styles` | String | String | Keep. |
| `end_container_on_empty_block` | Boolean/string | Boolean/string | Keep. |
| `content_css` | URL list | URL list or named skin | Rebuild. |
| `content_style` | String | String | Keep for inline overrides. |
| `relative_urls` | Boolean | Boolean | Keep `false`. |
| `remove_script_host` | Boolean | Boolean | Keep `false`. |
| `convert_urls` | Boolean | Boolean | Keep `false`. |
| `document_base_url` | URL | URL | Keep. |
| `valid_elements` | String | String | Audit; v8 schema is stricter. |
| `extended_valid_elements` | String | String | Audit. |
| `invalid_elements` | String | String | Audit. |
| `valid_children` | String | String | Audit. |
| `verify_html` | Boolean | Boolean | Keep; test shortcodes/HTML. |
| `paste_as_text` | Boolean | Boolean | Keep; portable replacement for `pastetext` button. |
| `paste_data_images` | Boolean | Boolean | Keep; default `true` in v8. |
| `paste_*` legacy options | Many | Removed or changed | Remove; port behavior to `PastePreProcess`. |
| `text_patterns` | Not present | Array/false; default triggers on Space | Keep WP `wptextpattern` and set `false`, or port patterns. |
| `tabfocus_elements` | Supported | Removed | Remove. |
| `rtl_ui` | Supported | Removed | Remove; use `directionality`. |
| `directionality` | `ltr`/`rtl` | Still supported | Keep. |
| `language` | Locale code | Locale code | Keep; hyphenate filenames. |
| `language_url` | URL | URL | Update to RFC5646 file. |
| `language_load` | Boolean | Boolean | Verify. |
| `license_key` | Not present | Required for self-hosted | Set `'gpl'` in core defaults. |
| `sandbox_iframes` | Not present | `true` default | Review embeds; add exclusions or disable with justification. |
| `sandbox_iframes_exclusions` | Not present | Array of hosts | Add WordPress embed providers if needed. |
| `convert_unsafe_embeds` | Not present | `true` default | Test `<object>`/`<embed>` content; decide. |
| `highlight_on_focus` | Not present | `true` default | Keep; accessibility improvement. |
| `allow_html_in_comments` | Not present | `false` default | Keep `false` unless a content audit proves a need. |
| `xss_sanitization` | Not present | Boolean | Do not disable. |
| `crossorigin` | Not present | Function | Only needed for cross-origin assets; likely not for core. |
| `cache_suffix` | Supported | Supported | Keep; use `$tinymce_version`. |
| `media_url_resolver` | Callback style | Must return a Promise | Audit WP code; none known. |
| `images_upload_handler` | Callback | Still supported, changed signature | Audit WP code; WP uses `wp.media` instead. |
| `file_picker_callback` | Callback | Still supported | Audit third-party usage. |
| `object_resizing` | Boolean | Still supported | Verify. |
| `inline` / `content_editable` | Boolean | Still supported | WP uses iframe mode; no change. |
| `setup` / `init_instance_callback` | Functions | Still supported | Keep. |

**High-risk defaults to decide early:**

1. **`element_format`.** v4 defaulted to `xhtml`; v8 defaults to `html`. If WordPress does not set it, saving a post can turn `<br />` into `<br>` and `<img />` into `<img>`. Both are valid HTML, but the diff is noisy and can affect plugins/tests. Set `element_format: 'xhtml'` for the migration and revisit later.
2. **`resize`.** WordPress currently asks for vertical-only resizing. v8 only supports a boolean or `'both'`. Either accept both-direction resizing or implement a WP-owned vertical handle. Do not silently lose the resize affordance.
3. **`rtl_ui`.** Removing it is correct, but RTL toolbar layout must be verified. The v8 skin handles `dir=rtl`; the `ltr` button must still be registered.
4. **`license_key`.** Without `license_key: 'gpl'`, v8 disables the editor and shows a warning. This is a hard failure, not a cosmetic issue.
5. **`sandbox_iframes`.** v8 will add `sandbox=""` to iframes by default. WordPress embeds (YouTube, Vimeo, Spotify, etc.) may stop working in the editor preview. Decide between exclusions and disabling sandboxing, with a security review.

### 5.4 UI API

| v4 API | v8 replacement | Compatibility notes |
|---|---|---|
| `editor.addButton(id, spec)` | `editor.ui.registry.addButton(id, spec)` / `addToggleButton` / `addMenuButton` / `addSplitButton` | `onclick` → `onAction`; `cmd` → call `editor.execCommand` in `onAction`; `stateSelector` → `onSetup` + `api.setActive()`; `icon` must be a registered SVG name. |
| `editor.addMenuItem(id, spec)` | `editor.ui.registry.addMenuItem` / `addNestedMenuItem` / `addToggleMenuItem` | `onclick` → `onAction`; `cmd` → `onAction`; submenus use `getSubmenuItems`. |
| `editor.addContextToolbar(predicate, items)` | `editor.ui.registry.addContextToolbar(id, spec)` | New spec includes `predicate`, `items`, `position`, `scope`. |
| `editor.buttons` | No public object | Use the registry; compat4x can expose a proxy. |
| `editor.menuItems` | No public object | Use the registry. |
| `editor.theme.panel` | No equivalent | Use `addContextToolbar`, `addContextForm`, a dialog, or WP-owned DOM. |
| `tinymce.ui.Factory` | No equivalent | Rewrite; compat4x cannot emulate arbitrary controls. |
| `tinymce.ui.Control.extend` | No equivalent | Rewrite custom controls as registry buttons or WP DOM. |
| `tinymce.ui.FloatPanel.hideAll()` | No equivalent | Best-effort popup close in compat4x; native code should not depend on it. |
| `editor.windowManager.open(spec)` | `editor.windowManager.open(spec)` with v8 schema | `items` → `body: { type: 'panel', items }`; `buttons` array; `onsubmit` → `onSubmit`; `onclose` → `onCancel`/`onClose`; `api.getData()`. |
| `editor.windowManager.alert/confirm` | Still available | Same signatures; verify. |
| `editor.notificationManager.open(spec)` | Still available | `closeButton` removed; notifications always have a close button. |
| `editor.addSidebar` | `editor.ui.registry.addSidebar` | Port. |
| `editor.addAutocompleter` | `editor.ui.registry.addAutocompleter` | `ch` → `trigger` (v7+). |
| `editor.addCommand` | Still available | Keep. |
| `editor.addQueryStateHandler` | Still available | Keep. |
| `editor.addQueryValueHandler` | Still available | Keep. |
| `editor.shortcuts.add` | Still available | Keep. |
| `editor.formatter` | Still available | Keep. |
| `editor.dom` | Still available | Keep. |
| `editor.selection` | Still available | Keep; `selection.setContent` deprecated. |
| `editor.undoManager` | Still available | Keep. |
| `editor.parser` / `serializer` / `schema` | Still available | Keep; `remove_trailing_brs` removed. |
| `editor.getParam` | Still available, deprecated | Do not use in new code; use `editor.options.get()`. |
| `editor.options.get` | New | Use for normalized options. |
| `editor.settings` | Removed | Replace with `editor.options.get()`; compat4x proxy. |
| `editor.fire` | `editor.dispatch` | `fire` still works but is deprecated; port native code. |
| `tinymce.$` / `editor.$` | Removed | Use jQuery or native DOM; compat4x can alias jQuery. |
| `tinymce.editors` | Removed | `tinymce.EditorManager.get()` / `tinymce.get()`. |
| `tinymce.Env.ie` etc. | Removed | Use `Env.browser.*`, `Env.os.*`, `Env.deviceType.*`. |
| `tinymce.isIE` etc. | Removed | Use `Env` helpers. |
| `tinymce.util.XHR` | Removed | `fetch`. |
| `tinymce.util.Promise` | Removed | Native `Promise`. |
| `tinymce.util.JSON` | Removed | Native `JSON`. |
| `tinymce.util.JSONRequest` | Removed | `fetch` + `JSON`. |
| `tinymce.html.SaxParser` | Removed | `DomParser` / `Serializer`; compat4x cannot fully emulate. |

**Important nuance:** some TinyMCE migration documentation describes `editor.addButton`, `editor.addMenuItem`, and the old `windowManager.open` schema as “deprecated in 8, removed in 9.” The actual 8.10 runtime does **not** expose `editor.addButton` or `editor.addMenuItem`; only `editor.ui.registry.addButton`/`addMenuItem` exist. `windowManager.open` still exists, but the old schema is not accepted. Plan for removal, not deprecation.

### 5.5 Dialog schema

A typical v4 dialog:

```js
editor.windowManager.open({
	title: 'Insert link',
	body: [
		{ type: 'textbox', name: 'url', label: 'URL' },
		{ type: 'listbox', name: 'target', label: 'Target', values: [
			{ text: 'Same window', value: '' },
			{ text: 'New window', value: '_blank' }
		] }
	],
	onsubmit: function( e ) {
		editor.insertContent( '<a href="' + e.data.url + '">link</a>' );
	}
});
```

The v8 equivalent:

```js
editor.windowManager.open({
	title: 'Insert link',
	body: {
		type: 'panel',
		items: [
			{ type: 'input', name: 'url', label: 'URL' },
			{ type: 'selectbox', name: 'target', label: 'Target', items: [
				{ text: 'Same window', value: '' },
				{ text: 'New window', value: '_blank' }
			] }
		]
	},
	buttons: [
		{ type: 'cancel', text: 'Cancel' },
		{ type: 'submit', text: 'Insert', primary: true }
	],
	onSubmit: function( api ) {
		var data = api.getData();
		editor.insertContent( '<a href="' + data.url + '">link</a>' );
		api.close();
	}
});
```

Component mapping:

| v4 type | v8 type | Notes |
|---|---|---|
| `textbox` | `input` | `name`, `label`, `value`, `placeholder`. |
| `textarea` | `textarea` | Same. |
| `listbox` | `selectbox` | `values` → `items`. |
| `checkbox` | `checkbox` | Same. |
| `radiobox` | No direct type | Use `selectbox` or `collection`. |
| `button` | `button` | `onclick` → `onAction`; `text`, `icon`. |
| `container` | `panel` | `items`. |
| `label` | `label` | `text`. |
| `html` | `htmlpanel` | `html`. |
| `iframe` | `iframe` | Same. |
| `sizebox` | `input` | Use `input` with numeric validation. |
| `tabpanel` | `tabpanel` | `tabs`. |
| `grid` | `grid` | `columns`, `rows`. |
| `colorpicker` | `colorinput` | `colorinput` for hex colors. |
| `filepicker` | `dropzone` / `urlinput` | Depends on the use case. |

Buttons:

| v4 | v8 |
|---|---|
| `buttons: [{ text: 'OK', subtype: 'primary', onclick: ... }]` | `buttons: [{ type: 'submit', text: 'OK', primary: true }]` |
| `buttons: [{ text: 'Cancel', onclick: ... }]` | `buttons: [{ type: 'cancel', text: 'Cancel' }]` |
| `onsubmit` | `onSubmit` |
| `onclose` | `onCancel` or `onClose` |
| `e.data` | `api.getData()` |
| `e.preventDefault()` | `api.close()` or return `false`? Verify in spike. |

### 5.6 Editor API and events

| Area | v4 | v8 | Action |
|---|---|---|---|
| Event dispatch | `editor.fire(name, args)` | `editor.dispatch(name, args)` | Port native code; `fire` remains as a deprecated alias. |
| Event subscribe | `editor.on`, `off`, `once` | Same | Keep. |
| Custom event | `editor.fire('wptoolbar', ...)` | `editor.dispatch('wptoolbar', ...)` | Port; compat4x can alias. |
| Init events | `PreInit`, `PostRender`, `init` | Same | Keep. |
| Content events | `BeforeSetContent`, `SetContent`, `GetContent`, `BeforeGetContent`, `SaveContent` | Same | Keep; test. |
| Paste events | `PastePreProcess`, `PastePostProcess` | Same | Keep; paste options changed. |
| Node events | `NodeChange`, `ExecCommand`, `FormatApply`, `FormatRemove` | Same | Keep. |
| Keyboard/mouse | `keydown`, `keyup`, `click`, `dblclick`, `mousedown`, `mouseup`, `contextmenu` | Same | Keep. |
| Undo | `Undo`, `Redo`, `AddUndo` | Same | Keep. |
| Mode | `editor.setMode('readonly')` | `editor.mode.set('readonly')` | Port. |
| Content | `editor.setContent/getContent/insertContent` | Same | Keep; `selection.setContent` deprecated. |
| Selection | `editor.selection.getContent/setContent` | Same; `setContent` deprecated | Port to `insertContent`. |
| DOM | `editor.dom` | Same | Keep. |
| Undo manager | `editor.undoManager` | Same | Keep. |
| Formatter | `editor.formatter` | Same | Keep. |
| Shortcuts | `editor.shortcuts.add` | Same | Keep. |
| Commands | `editor.execCommand` | Same | Keep; some command names changed. |
| Query state | `editor.queryCommandState` | Same | Keep. |
| Query value | `editor.queryCommandValue` | Same | Keep. |
| Base URL | `editor.documentBaseUrl` | Removed | Use `editor.editorManager.documentBaseURI.getURI()`. |
| Editor list | `tinymce.editors` | Removed | `EditorManager.get()` / `tinymce.get()`. |
| Active editor | `tinymce.activeEditor` | Same | Keep. |
| Trigger save | `tinymce.triggerSave()` | Same | Verify. |
| Add editor | `tinymce.execCommand('mceAddEditor', ...)` | Verify | Prefer `tinymce.init`. |
| Remove editor | `tinymce.execCommand('mceRemoveEditor', ...)` | Verify | Prefer `editor.remove()`. |
| Toggle editor | `tinymce.execCommand('mceToggleEditor', ...)` | Verify | Prefer show/hide. |

### 5.7 Plugin and feature changes

| v4 plugin/feature | v8 status | WordPress uses it? | Action |
|---|---|---|---|
| `paste` | Merged into core | Yes, in default list | Remove plugin name; port `PastePreProcess` filters. |
| `hr` | Merged into core; command `InsertHorizontalRule` | Yes, toolbar button and plugin | Remove plugin; register a custom `hr` button. |
| `tabfocus` | Removed; browser/core handles Tab | Yes | Remove. |
| `textpattern` | Merged into core as `text_patterns` | WP has custom `wptextpattern` | Choose native patterns or keep custom + `text_patterns: false`. |
| `colorpicker` | Merged into core | Yes, teeny/default lists | Remove. |
| `textcolor` | Merged into core (`forecolor`/`backcolor`) | Yes | Remove; use core buttons. |
| `contextmenu` | Merged into core | Not in WP list | Remove if added by plugins. |
| `noneditable` | Merged into core | Not in WP list | Remove if added. |
| `nonbreaking` | Still a plugin | Not used | Available if needed. |
| `fullpage` | Premium only | Not used | Do not add. |
| `spellchecker` | Removed | Yes, toolbar button | Remove button; use `browser_spellcheck: true`. |
| `imagetools` | Removed; premium `editimage` | Not used | Do not add. |
| `template` | Removed; premium `advtemplate` | Not used | Do not add. |
| `toc` | Premium `tableofcontents` | Not used | Do not add. |
| `table` | Core | Not in WP list | Available. |
| `media` | Still a plugin | Yes, in default list | Evaluate removal; WP uses `wp.media`/`wpview`. |
| `image` | Still a plugin | Only when no media library | Keep for that fallback; otherwise remove. |
| `link` | Still a plugin | Yes, but WP uses `wplink` | Keep for command support; WP’s `wplink` is the UI. |
| `lists` | Still a plugin | Yes | Keep. |
| `charmap` | Still a plugin | Yes | Keep. |
| `fullscreen` | Still a plugin | Yes | Keep. |
| `directionality` | Still a plugin | Yes, for RTL | Keep. |
| `code` | Still a plugin | WP uses custom `wp_code` | Optional. |
| `help` | Still a plugin | WP uses custom help dialog | Evaluate replacing WP help with v8 help. |
| `wordcount` | Still a plugin | Not used | Optional. |
| `autoresize` | Still a plugin | WP has custom `wpautoresize` | Evaluate replacement. |
| `advlist` | Still a plugin | Not used | Do not add. |
| `anchor` | Still a plugin | Not used | Do not add. |
| `autolink` | Still a plugin | Not used | Check if v8 core auto-links; WP may rely on browser behavior. |
| `emoticons` | Still a plugin | WP uses `wpemoji` | Do not add. |
| `importcss` | Still a plugin | WP uses `content_css` | Do not add. |
| `insertdatetime` | Still a plugin | Not used | Do not add. |
| `pagebreak` | Still a plugin | WP has `wp_more`/`wp_page` | Do not add. |
| `preview` | Still a plugin | Not used | Do not add. |
| `save` | Still a plugin | Not used | Do not add. |
| `searchreplace` | Still a plugin | Not used | Do not add. |
| `visualblocks` | Still a plugin | Not used | Do not add. |
| `visualchars` | Still a plugin | Not used | Do not add. |
| `quickbars` | Still a plugin | WP has custom toolbars | Evaluate as a replacement for custom inline toolbars. |
| `accordion`, `codesample` | Still plugins | Not used | Do not add. |

### 5.8 Toolbar and button name changes

| v4 name | v8 name | WordPress action |
|---|---|---|
| `formatselect` | `blocks` | Map; set `block_formats` to WP’s list. |
| `styleselect` | `styles` | Map; WP does not use it by default. |
| `fontselect` | `fontfamily` | Map. |
| `fontsizeselect` | `fontsize` | Map. |
| `spellchecker` | Removed | Remove button; keep `browser_spellcheck`. |
| `hr` | No toolbar button | Register custom `hr` button. |
| `pastetext` | No toolbar button | Register custom toggle button using `mceTogglePlainTextPaste`. |
| `wp_more` | WP custom | Register with `editor.ui.registry`. |
| `wp_page` | WP custom | Register. |
| `wp_help` | WP custom | Register; or use v8 `help`. |
| `wp_code` | WP custom | Register. |
| `wp_adv` | WP custom | Register; decide drawer vs row toggle. |
| `dfw` | WP custom | Register. |
| `wp_add_media` | WP custom | Register. |
| `wp_view` | WP custom | Register. |
| `wp_image` | WP custom | Register. |
| `wp_link` | WP custom | Register. |
| `fullscreen` | `fullscreen` | Keep. |
| `link` / `unlink` | `link` / `unlink` | Keep; WP’s `wplink` command. |
| `image` | `image` | Keep only for no-media-library fallback. |
| `forecolor` / `backcolor` | Same | Core; no plugin needed. |
| `charmap` | `charmap` | Keep plugin. |
| `outdent` / `indent` | Same | Core. |
| `undo` / `redo` | Same | Core. |
| `removeformat` | Same | Core. |
| `bullist` / `numlist` | Same | Lists plugin. |
| `alignleft` / `aligncenter` / `alignright` / `alignjustify` | Same | Core. |
| `blockquote` | Same | Core. |
| `strikethrough` | Same | Core. |
| `bold` / `italic` / `underline` | Same | Core. |

**`block_formats` parity.** WordPress’s `formatselect` list should be reproduced explicitly:

```js
block_formats: 'Paragraph=p;Heading 1=h1;Heading 2=h2;Heading 3=h3;Heading 4=h4;Heading 5=h5;Heading 6=h6;Preformatted=pre;Address=address;Div=div'
```

Check the exact v4 labels and order before shipping; they are part of the user-visible editor behavior.

### 5.9 Content, sanitization, and serialization

| Area | v4 | v8 | WordPress action |
|---|---|---|---|
| Root block | `p` default; `false` allowed | `p` default; `false` rejected | Keep `p`; reject `false` from filters. |
| Element format | `xhtml` default | `html` default | Set `xhtml` to preserve output, or accept/test a diff. |
| Entity encoding | `named` default | `named` default | WP sets `raw`; keep. |
| Comments | Preserved | DOMPurify `SAFE_FOR_XML` may strip comments containing tags | Test `<!--more-->`, `<!--nextpage-->`, block comments, conditional comments. |
| Iframes | Not sandboxed | `sandbox=""` by default | Review embeds; use `sandbox_iframes_exclusions` or disable with justification. |
| `<object>`/`<embed>` | Preserved | Converted to safer elements by default | Test old embed content; decide. |
| Scripts | Stripped/allowed by schema | Stricter | Rely on server-side KSES; never trust client sanitization. |
| `data-*` attributes | Allowed by schema | Allowed if schema permits | Audit `valid_elements`; WP shortcodes/views use data attributes. |
| Shortcodes | Preserved as text | Preserved | Test `[gallery]`, `[caption]`, `[embed]`, `[playlist]`, `[audio]`, `[video]`. |
| HTML5 captions | `wpeditimage_html5_captions` custom option | Still a WP custom option | Port `wpeditimage` logic. |
| Tables | `mce-item-table` class | `mce-item-table` still used | Keep content CSS. |
| Anchors | `mce-item-anchor` | Still used | Keep content CSS. |
| Split buttons | One DOM component | Two components | Update custom CSS. |
| Autolink | v4 behavior | v8 may differ | Test typing URLs and pasting links. |
| `remove_trailing_brs` | Supported on `DomParser` | Removed | Remove from any parser args. |
| `force_hex_color` | Supported | Removed | Remove; use standard color conversion. |
| `table_responsive_width` | Supported | Replaced by `table_sizing_mode` | Remove/migrate. |
| `media_url_resolver` | Callback style | Promise style | Migrate if used. |

**Content round-trip is the highest-risk area.** The editor is where user content is created and saved. A serialization change that turns `<br />` into `<br>`, strips a comment, or rewrites an iframe is not cosmetic. The project needs a corpus-based round-trip test before beta.

### 5.10 Utilities and DOM helpers

| v4 | v8 | Notes |
|---|---|---|
| `tinymce.util.Tools.resolve` | Still available | Keep. |
| `tinymce.util.Tools.each/map/grep/inArray/extend/trim` | Still available | Keep. |
| `tinymce.util.VK` | Still available | Keep. |
| `tinymce.util.Delay` | Still available | Keep. |
| `tinymce.util.URI` | Still available | Keep. |
| `tinymce.util.EventDispatcher` | Still available | Keep. |
| `tinymce.util.Observable` | Still available | Keep. |
| `tinymce.util.I18n` | Still available | Keep. |
| `tinymce.util.LocalStorage` | Still available | Keep. |
| `tinymce.util.XHR` | Removed | `fetch`. |
| `tinymce.util.Promise` | Removed | Native `Promise`. |
| `tinymce.util.JSON` | Removed | Native `JSON`. |
| `tinymce.util.JSONRequest` | Removed | `fetch` + `JSON`. |
| `tinymce.util.JSONP` | Removed | Script tag if needed. |
| `tinymce.html.SaxParser` | Removed | `DomParser`/`Serializer`. |
| `tinymce.html.DomParser` | Still available | Keep. |
| `tinymce.html.Serializer` | Still available | Keep. |
| `tinymce.html.Schema` | Still available | Keep. |
| `tinymce.html.Writer` | Still available | Keep. |
| `tinymce.html.Styles` | Still available | Keep. |
| `tinymce.html.Entities` | Still available | Keep. |
| `tinymce.html.Node` | Still available | Keep. |
| `tinymce.dom.DOMUtils` | Still available | Keep. |
| `tinymce.dom.RangeUtils` | Still available | Keep. |
| `tinymce.dom.Selection` | Still available | Keep. |
| `tinymce.dom.Serializer` | Still available | Keep. |
| `tinymce.dom.StyleSheetLoader` | Still available | Keep. |
| `tinymce.DOM` | Still available | Keep. |
| `tinymce.ScriptLoader` | Still available | Keep; `markDone` used by WP translations. |
| `tinymce.PluginManager` | Still available | Keep. |
| `tinymce.ThemeManager` | Still available | Keep. |
| `tinymce.ModelManager` | Still available | Keep. |
| `tinymce.AddOnManager` | Still available | Keep. |
| `tinymce.EditorManager` | Still available | Keep. |
| `tinymce.activeEditor` | Still available | Keep. |
| `tinymce.get()` | Still available | Keep. |
| `tinymce.init()` | Still available | Keep. |
| `tinymce.addI18n()` | Still available | Keep. |
| `tinymce.translate()` | Still available | Keep. |

### 5.11 i18n and language packs

| Area | v4 | v8 | Action |
|---|---|---|---|
| Language file naming | `en_US.js`, `_dlg.js` | `en-US.js`; underscore deprecated in 8.x, removed in 9 | Migrate filenames and URLs. |
| `_dlg.js` | Separate dialog strings | No separate dialog file | Remove `_dlg` loading. |
| `language` option | Locale code | Locale code | Keep. |
| `language_url` | URL | URL | Point at hyphenated file. |
| `tinymce.addI18n(code, strings)` | Supported | Supported | Keep. |
| `tinymce.ScriptLoader.markDone(url)` | Supported | Supported | Keep. |
| WP translation filter | `wp_mce_translation` | Keep | Audit strings. |
| RTL | `rtl_ui` + `_dir` | `directionality` + `_dir` | Remove `rtl_ui`; keep `_dir`. |
| Translation coverage | v4 strings | v8 string set changed | Regenerate the string inventory; add/remove keys. |

**WordPress-specific issue:** `WP_Editor::get_mce_locale()` returns locales such as `en_US`, `de_DE`, `pt_BR`. TinyMCE 8 accepts underscore filenames only in 8.x. WordPress should generate hyphenated filenames (`en-US`, `de-DE`, `pt-BR`) now, while keeping the `language` code that `addI18n` uses. Verify whether v8’s `addI18n` lookup expects the same hyphenated code; if not, add both aliases during the transition.

### 5.12 Licensing

| Area | v4 | v8 | Action |
|---|---|---|---|
| License | LGPL 2.1 | GPLv2+ or commercial | Core uses GPLv2+. |
| Self-hosted key | Not required | Required | `license_key: 'gpl'`. |
| Missing key | Editor works | Editor disabled/read-only | Add to defaults and all init paths, including Classic block and third-party `wp_editor()` calls. |
| Premium features | N/A | `GPL+T8LK:` keys | Not needed for core; do not ship premium plugins. |
| License files | `license.txt` | `license.md`, `notices.txt` | Include; legal review. |
| Promotion | N/A | `promotion` option | Set `false`. |
| Branding | `branding` option | `branding` option | Keep `false`. |

### 5.13 CSS and DOM

| v4 selector | v8 selector | Notes |
|---|---|---|
| `.mce-tinymce` | `.tox-tinymce` | Editor container. |
| `.mce-toolbar-grp` | `.tox-editor-header` / `.tox-toolbar-overlord` | Header region; not a 1:1 replacement. |
| `.mce-toolbar` | `.tox-toolbar` | Toolbar row. |
| `.mce-btn-group` | `.tox-toolbar__group` | Button group. |
| `.mce-btn` | `.tox-tbtn` | Toolbar button. |
| `.mce-btn.mce-active` | `.tox-tbtn--enabled` / `aria-pressed` | Active state. |
| `.mce-menu` | `.tox-menu` | Menu. |
| `.mce-menu-item` | `.tox-collection__item` | Menu item. |
| `.mce-window` | `.tox-dialog` | Dialog. |
| `.mce-window-head` | `.tox-dialog__header` | Dialog header. |
| `.mce-close` | `.tox-dialog__close` / `.tox-button--icon` | Close button. |
| `.mce-textbox` | `.tox-textfield` | Text input. |
| `.mce-listbox` | `.tox-listbox` | Select box. |
| `.mce-floatpanel` | `.tox-pop` / `.tox-dialog` | Floating panel. |
| `.mce-inline-toolbar-grp` | `.tox-pop` | Context toolbar. |
| `.mce-tooltip` | `.tox-tooltip` | Tooltip. |
| `.mce-statusbar` | `.tox-statusbar` | Status bar. |
| `.mce-path` | `.tox-statusbar__path` | Element path. |
| `.mce-edit-area` | `.tox-edit-area` | Iframe container. |
| `.mce-container-body` | `.tox-editor-container` | Inner container. |
| `.mce-ico` | `.tox-icon` | Icon wrapper. |
| `.mce-i-*` | `.tox-icon` + SVG | Icon names are registry-based. |
| `.mce-caret` | `.tox-caret` | Dropdown caret. |
| `.mce-menubtn` | `.tox-mbtn` / `.tox-tbtn` | Menu button. |
| `.mce-menubar` | `.tox-menubar` | Menu bar. |
| `.mce-notification` | `.tox-notification` | Notification. |
| `.mce-charmap` | `.tox-collection--grid` | Charmap grid. |
| `.mce-colorbutton` | `.tox-split-button` / `.tox-tbtn` | Color button. |
| `.mce-splitbtn` | `.tox-split-button` | Split button; v8 renders two components. |
| `.mce-rtl` | `[dir=rtl]` | RTL is attribute-based. |
| `.mce-fullscreen` | `.tox-fullscreen` | Fullscreen body class. |
| `.mce-wp-help`, `.mce-wp-dfw`, `.mce-i-wp_*` | WP-owned classes / registered SVG icons | Do not depend on TinyMCE internals. |

**Recommended CSS architecture:**

1. **WordPress chrome layer:** `.wp-editor-wrap`, `.wp-editor-tools`, `.wp-editor-area`, `.wp-media-buttons`, `.wp-editor-expand`. These are WP-owned and stable.
2. **TinyMCE contract layer:** a small, documented set of v8 selectors (`.tox-tinymce`, `.tox-editor-header`, `.tox-toolbar`, `.tox-edit-area`, `.tox-statusbar`, `.tox-menu`, `.tox-dialog`, `.tox-pop`, `.tox-tbtn`) with comments explaining why each is needed.
3. **Content layer:** `.mce-content-body`, `.mce-item-table`, `.mce-item-anchor`, `.mce-shim`, plus WP content classes (`.wp-caption`, `.gallery`, `.alignleft`, etc.).
4. **No global search/replace.** A blind `.mce-*` → `.tox-*` replacement will produce subtly wrong layout because the DOM structure is different.

### 5.14 Accessibility and UX changes

| Area | v4 | v8 | Action |
|---|---|---|---|
| Focus highlight | Not default | `highlight_on_focus: true` | Keep; verify against WP admin styles. |
| Toolbar keyboard nav | v4 behavior | New silver toolbar | Test Tab/Arrow/Enter/Escape. |
| Dialogs | jQuery UI / v4 windows | v8 dialogs with focus trap | Test focus return, Escape, screen readers. |
| Notifications | Optional close button | Always-visible close button | Update CSS/UX. |
| Split buttons | One component | Two components | Update keyboard and CSS. |
| Toolbar drawer | N/A | Floating/sliding/scrolling/wrap | Decide `wp_adv` behavior. |
| Touch targets | v4 sizes | v8 sizes | Verify mobile. |
| RTL | `rtl_ui` | `[dir=rtl]` | Visual QA. |
| Status bar | v4 | v8 | Verify element path/resize handle. |

### 5.15 Decisions this matrix forces

Before implementation starts, the project must decide:

1. Native text patterns vs. keeping `wptextpattern`.
2. Native v8 dialogs vs. keeping WordPress modals for link/image/media.
3. `wp_adv` as a toolbar drawer vs. a CSS-toggled second row vs. a menu button.
4. `element_format: 'xhtml'` vs. accepting HTML serialization changes.
5. `sandbox_iframes` on (with exclusions) vs. off.
6. Vertical-only resize vs. both-direction resize.
7. Keep `compat4x` in core permanently as a third-party bridge, or only in the feature plugin and a separate compatibility plugin.
8. Whether `wpdialogs` survives as an opt-in adapter or is deprecated.
9. Whether `media` and `image` stock plugins remain in the default list.
10. Whether WordPress builds a custom skin or uses oxide plus overrides.

These are tracked in Section 15 (Open questions and decision log).

<!-- PLAN-APPEND -->

---

## 6. Architecture options

### 6.1 Evaluation criteria

Every option is scored against the same nine criteria. Weights reflect what has historically caused WordPress editor migrations to fail: ecosystem breakage and an inability to test early.

| # | Criterion | Weight | What "good" looks like |
|---|---|---|---|
| C1 | Ecosystem safety | 25% | Third-party TinyMCE plugins keep working, or fail loudly with a documented migration path. |
| C2 | Time to a testable artifact | 15% | Plugin authors can run their code against the new editor within weeks, not after a core merge. |
| C3 | Core maintenance burden | 15% | WordPress does not own a permanent fork or a second editor stack. |
| C4 | Security posture | 15% | Upstream security fixes can be adopted by bumping the vendor version. |
| C5 | Performance | 10% | Editor payload and time-to-interactive stay within a measured budget. |
| C6 | Reversibility | 5% | The project can stop or roll back without stranding users. |
| C7 | Gutenberg impact | 5% | The Classic block (`core/freeform`) continues to work without a fork. |
| C8 | Contributor feasibility | 5% | The work can be split among volunteers and a small sponsored team. |
| C9 | Release risk | 5% | The change can ship in a normal core release cycle with normal beta/RC coverage. |

### 6.2 Option A — Big-bang upgrade in core

**Description:** Replace `src/js/_enqueues/vendor/tinymce/` with TinyMCE 8.10.x in one release cycle, port WordPress's nine plugins and CSS in the same cycle, and ship it as the only editor.

**What it requires:**

- A complete native port of `class-wp-editor.php`, `script-loader.php`, `_mce_set_direction()`, `base.js`, `dfw.js`, `mce-view.js`, `wpeditimage`, `wplink`, `wpview`, `wordpress`, `wpdialogs`, `wpgallery`, `wptextpattern`, `wpautoresize`, `wpemoji`.
- A `.mce-*` → `.tox-*` CSS rewrite in `editor.css`, `edit.css`, `customize-widgets.css`, and Gutenberg.
- A compatibility story for every third-party plugin that calls `editor.addButton`, `tinymce.ui.*`, `editor.settings`, or old `windowManager` schemas.
- A Gutenberg PR for the Classic block in the same release window.
- All of it landing before the first beta, because there is no way to partially ship an editor.

**Strengths:** shortest calendar time if everything lands; no interim architecture; no dual-stack period.

**Weaknesses:** the first time anyone outside core sees the new editor is core beta. Plugin authors get no lead time. Regressions arrive during the least forgiving part of the cycle. If the port slips, the release slips or the editor is reverted late, which is worse than not starting. It also concentrates all compatibility work into one team and one merge window.

**Verdict:** rejected. This is the failure mode Trac #47218 warned about.

### 6.3 Option B — Feature plugin first, then core integration (recommended)

**Description:** Build a standalone `wordpress-tinymce-8` feature plugin that bundles TinyMCE 8, an in-house `compat4x` bridge, and a port of WordPress's own nine plugins. Ship it to plugin authors as an alpha/beta. Use the feedback to harden the bridge and the native port. Then merge the proven code into core, dropping the parts of `compat4x` that core no longer needs.

**Shape:**

```
wordpress-tinymce-8/                 (feature plugin, initially)
├── wordpress-tinymce-8.php          bootstrap, version gate, opt-in
├── includes/
│   ├── class-wp-tinymce8-plugin.php
│   ├── class-wp-tinymce8-settings.php   mirrors class-wp-editor.php
│   ├── class-wp-tinymce8-scripts.php    mirrors script-loader.php
│   └── compat/
│       ├── class-wp-tinymce8-compat.php
│       └── plugins/compat4x/plugin.js
├── js/
│   ├── tinymce/                     vendored 8.10.x
│   ├── plugins/                     ported WP plugins
│   └── wp/                          ported base.js, dfw.js, mce-view.js
├── css/
│   ├── editor.css                   new .tox-* chrome
│   └── compat4x.css                 transitional .mce-* aliases
└── tests/
    ├── phpunit/
    ├── qunit/
    └── e2e/
```

**Strengths:** plugin authors get a target months before core. Compatibility data is collected while the design can still change. Each ported module can be reviewed independently. Core integration becomes a merge of proven code, not a research project. Failure is cheap: the plugin can stay a plugin.

**Weaknesses:** two codebases during the project; the feature plugin must track core's editor changes; the plugin cannot perfectly simulate core's load order, so some integration bugs only appear at merge. These are manageable with a scheduled rebase cadence and a "core integration" phase.

**Verdict:** recommended.

### 6.4 Option B′ — Dual-bundle opt-in inside core

**Description:** Ship both v4 and v8 in core, with v4 as the default and v8 behind a filter or a setting.

**Why it is tempting:** it appears to de-risk the rollout and gives users a switch.

**Why it fails:**

- It doubles the bootstrap surface: `wp-tinymce-root`, two compatibility plugins, two sets of WP plugins, two CSS systems, two translation catalogs.
- Every editor bug becomes "which stack?" and the support matrix doubles.
- Both stacks must be maintained for the entire transition, including security patches for v4.
- The opt-in will be used by hosts and plugins as a permanent compatibility crutch, so the "temporary" second stack outlives its welcome.
- Core's own code paths (`base.js`, `mce-view.js`, `wpdialogs`) cannot be written against both APIs without a permanent abstraction layer, which is exactly the maintenance burden the migration is meant to remove.

**Verdict:** acceptable only as an internal development mode inside the feature plugin (a filter that restores v4 for A/B debugging). Never as a shipped core configuration.

### 6.5 Option C — Stay on v4, or maintain a security-only fork

**Description:** Keep 4.9.11, backport security fixes, and defer the upgrade indefinitely.

**Strengths:** zero ecosystem breakage in the short term; no porting work.

**Weaknesses:** WordPress owns an EOL editor forever. Every browser change is a WordPress bug. Security fixes must be written without upstream. The plugin ecosystem remains on a dead API. The eventual port grows larger every year, because WordPress's own code keeps accreting v4 assumptions.

A security-only fork is a legitimate **contingency** if the migration stalls, but it is not an architecture. If chosen, it needs a named maintainer, an upstream-diff process, and a published EOL date.

**Verdict:** rejected as a strategy; retained as a contingency (see Section 15).

### 6.6 Option D — Replace TinyMCE with a different editor

**Description:** Drop TinyMCE entirely and adopt a modern editor (e.g. a block-first editor, ProseMirror/Tiptap, Lexical, or a commercial editor) for the classic contexts.

**Strengths:** could modernize the editing experience and eliminate the TinyMCE compatibility problem.

**Weaknesses:** WordPress's classic editor is an API, not just a UI. `wp_editor()`, `the_content` filters, shortcodes, `wpview`, `wpeditimage`, `wplink`, `wp.media` integration, and thousands of plugins depend on TinyMCE's command/plugin/content model. Replacing the engine is a larger project than upgrading it, and it does not solve the Classic block, which Gutenberg explicitly decided to keep. It also forces every TinyMCE plugin author to rewrite, which is the same breakage with none of the API continuity.

**Verdict:** out of scope. A separate, longer-term product question.

### 6.7 Option E — Intermediate upgrade to v5, v6, or v7

**Description:** Step through one or more intermediate majors before v8.

**Strengths:** smaller individual diffs; some migration guides are written pairwise.

**Weaknesses:** each intermediate major is itself EOL or near-EOL; each requires a full integration and ecosystem beta; the cumulative work is larger than a direct 4 → 8 port because WordPress's own plugins and CSS would be ported two or three times. The official 4 → 8 guide is explicitly cumulative.

**Verdict:** rejected. Go directly to 8.

### 6.8 Decision matrix

Scores are 1 (poor) to 5 (excellent), weighted by the criteria in 6.1.

| Criterion (weight) | A. Big bang | B. Feature plugin | B′. Dual bundle | C. Stay/fork v4 | D. Replace editor | E. v5/v6/v7 |
|---|---|---|---|---|---|---|
| C1 Ecosystem safety (25%) | 1 | 5 | 3 | 4 | 1 | 3 |
| C2 Testable early (15%) | 1 | 5 | 3 | 5 | 1 | 2 |
| C3 Core maintenance (15%) | 4 | 4 | 1 | 1 | 2 | 3 |
| C4 Security (15%) | 5 | 5 | 3 | 1 | 5 | 3 |
| C5 Performance (10%) | 4 | 4 | 2 | 5 | 3 | 4 |
| C6 Reversibility (5%) | 1 | 4 | 4 | 5 | 2 | 3 |
| C7 Gutenberg impact (5%) | 2 | 4 | 2 | 5 | 2 | 3 |
| C8 Contributor feasibility (5%) | 2 | 4 | 2 | 3 | 1 | 2 |
| C9 Release risk (5%) | 1 | 4 | 2 | 3 | 1 | 3 |
| **Weighted score** | **2.55** | **4.60** | **2.60** | **3.05** | **2.10** | **3.00** |

The feature-plugin path wins decisively. The second-best option is staying on v4, which is telling: if the project cannot commit to the feature-plugin path, the honest choice is a maintained fork, not a rushed swap.

### 6.9 Why the feature plugin is not just delay

A feature plugin is sometimes used to postpone hard decisions. This one has a fixed charter and hard exit criteria. It exists to answer four questions with evidence:

1. Which third-party APIs actually appear in the wild, and how completely can `compat4x` cover them?
2. Which WordPress behaviors regress under v8, and what is the native fix?
3. What is the real performance and accessibility delta?
4. Can Gutenberg's Classic block run on the same stack without a fork?

If the answers are bad, the project stops with a plugin and a report, not a broken core release. That is the point.

### 6.10 Feature-plugin exit criteria

The feature plugin is done, and core integration may begin, only when all of the following are true:

| Gate | Criterion | Evidence |
|---|---|---|
| G1 | v8 editor boots in Classic, Classic block, widgets, and `wp_editor()` | E2E suite green on supported browsers |
| G2 | All nine WP plugins are ported natively; `compat4x` is not required for core's own code | Code search shows no v4-only API in `js/plugins/` |
| G3 | `compat4x` covers the top represented third-party APIs at ≥95% by install base | Compatibility survey + shim test suite |
| G4 | Content round-trips are byte-stable for the corpus in Section 10 | Golden-file tests |
| G5 | No P1/P2 accessibility regressions in the audit checklist | Accessibility report |
| G6 | Payload within the budget in Section 13 | Measured build artifacts |
| G7 | Gutenberg Classic block passes its E2E suite against the plugin | Gutenberg test run |
| G8 | At least 20 popular editor plugins tested, with results published | Compatibility tracker |
| G9 | Rollback path verified | Rollback plugin + runbook |
| G10 | Security review signed off | Section 12 checklist |

Passing these gates does **not** by itself authorize core integration. It is the evidence used to ask core maintainers to reopen #47218 (Section 2.4). If they decline, the project continues as a maintained plugin, and Phases 8–10 are skipped.

---

## 7. Target architecture

### 7.1 Principles

1. **One editor in core.** The feature plugin is the only place where v4 and v8 coexist.
2. **Native first, shim second.** WordPress's own code must use v8 APIs. `compat4x` exists for third parties.
3. **Preserve WordPress's public contracts.** `wp_editor()`, `wp.editor.*`, `wp.oldEditor.*`, `tinyMCEPreInit`, the `tinymce_*` filters, and the `wpview`/`wplink`/`wpeditimage` behaviors are public API. Their internals may change; their observable behavior should not.
4. **Content is the long-lived artifact.** Editor UI can change; stored post content must not. Serialization changes are treated as bugs unless explicitly approved.
5. **No permanent fork.** Every WordPress-specific patch to vendor code is either upstreamed, isolated in a WP plugin, or documented as a deliberate override.
6. **Measure before and after.** Performance, accessibility, and compatibility claims require numbers, not impressions.
7. **Fail loudly in development, gracefully in production.** Deprecated APIs should log in `SCRIPT_DEBUG` and degrade rather than fatal.

### 7.2 Repository and package layout

**Feature plugin (stage A):**

```
wordpress-tinymce-8/
├── wordpress-tinymce-8.php
├── readme.txt
├── includes/
│   ├── class-wp-tinymce8-plugin.php        bootstrap, hooks, opt-in
│   ├── class-wp-tinymce8-editor.php        port of class-wp-editor.php
│   ├── class-wp-tinymce8-scripts.php       registration and inline scripts
│   ├── class-wp-tinymce8-compat.php        PHP-side compat (filters, settings)
│   └── functions.php                       template helpers
├── js/
│   ├── tinymce/                            vendored 8.10.x
│   │   ├── tinymce.min.js
│   │   ├── models/dom/model.min.js
│   │   ├── themes/silver/theme.min.js
│   │   ├── skins/ui/oxide/...
│   │   ├── skins/content/...
│   │   ├── icons/default/icons.min.js
│   │   ├── plugins/...
│   │   └── license.md, notices.txt
│   ├── plugins/
│   │   ├── wordpress/plugin.js
│   │   ├── wpautoresize/plugin.js
│   │   ├── wpeditimage/plugin.js
│   │   ├── wpemoji/plugin.js
│   │   ├── wpgallery/plugin.js
│   │   ├── wplink/plugin.js
│   │   ├── wptextpattern/plugin.js
│   │   ├── wpview/plugin.js
│   │   ├── wpdialogs/plugin.js             optional, off by default
│   │   └── compat4x/plugin.js
│   ├── wp/
│   │   ├── editor/base.js
│   │   ├── editor/dfw.js
│   │   └── mce-view.js
│   └── wp-tinymce8.js                      bootstrap for tinyMCEPreInit
├── css/
│   ├── editor.css
│   ├── content.css
│   └── compat4x.css
├── languages/
└── tests/
```

**Core (stage B):** the same files land in their existing homes:

- `src/js/_enqueues/vendor/tinymce/` → v8 vendor tree.
- `src/js/_enqueues/vendor/tinymce/plugins/wp*/` → ported plugins (unchanged paths).
- `src/js/_enqueues/wp/editor/{base,dfw}.js`, `src/js/_enqueues/wp/mce-view.js` → ported.
- `src/wp-includes/class-wp-editor.php`, `src/wp-includes/script-loader.php`, `src/wp-includes/functions.php` → updated.
- `src/wp-includes/css/editor.css`, `src/wp-admin/css/edit.css` → rewritten.
- `Gruntfile.js` → updated copy/minify/concat.

Keeping the paths stable is deliberate: it minimizes the diff, keeps `plugins/wordpress/plugin.js` URL-addressable, and preserves any plugin that enqueues a WP editor stylesheet by path (rare, but it happens).

### 7.3 Load order and bootstrap

The current bootstrap (`editor_js()`) prints `tinyMCEPreInit` with `baseURL`, `suffix`, `settings`, and `ref`, then loads the editor. v8 changes the vendor files but not the contract. The target sequence is:

1. **`wp_register_tinymce_scripts()`** registers:
   - `wp-tinymce-root` → `tinymce.min.js`
   - `wp-tinymce-model` → `models/dom/model.min.js` (new dependency; v8 requires the DOM model)
   - `wp-tinymce-theme` → `themes/silver/theme.min.js`
   - `wp-tinymce-icons` → `icons/default/icons.min.js`
   - `wp-tinymce-skin` → `skins/ui/oxide/skin.min.css` (registered as a style, not a script)
   - `wp-tinymce-content-css` → `skins/content/default/content.min.css`
   - `wp-tinymce` → `compat4x/plugin.js` (replaces `compat3x`)
   - `wp-tinymce-lists` → `lists/plugin.min.js`
   - `wp-tinymce` must depend on root, model, theme, icons.

2. **`wp_tinymce_inline_scripts()`** emits `tinyMCEPreInit` before the root script. v8 still reads `window.tinyMCEPreInit.baseURL` and `.suffix`, verified at runtime. It must also emit:
   - `license_key: 'gpl'`
   - `promotion: false`
   - `branding: false`
   - `skin: 'oxide'` (or `oxide-dark` when appropriate)
   - `content_css` pointing at the WP content stylesheet
   - `base_url` (v8 prefers `base_url` over `baseURL` in some paths; emit both for safety)

3. **`wp_mce_translation()`** still calls `tinymce.ScriptLoader.markDone()`, which exists in v8. The language file naming changes: v8 expects `langs/en-GB.js`, not `langs/en_GB.js`. WordPress's `_WP_Editors::$mce_locale` uses underscores in some paths; the URL builder must normalize to hyphens, with a fallback to the underscore file for 8.x (v8 still accepts underscores, removal is planned for 9).

4. **Editor init** happens through `tinymce.init()` with settings assembled by `_WP_Editors::parse_settings()` and `wp_editor_set_quality()`. The `ref` object in `tinyMCEPreInit` currently names `theme: 'modern'`; this becomes `theme: 'silver'` and `plugins` becomes the v8 plugin list.

5. **`wp.editor.initialize()`** in `base.js` remains the public entry point. It must no longer assume `.mce-tinymce` or `editor.theme.resizeTo`.

**Critical detail:** v8 requires the DOM model to be loaded **before** `tinymce.min.js` initializes the editor, but the model file itself attaches to `tinymce.model.dom`. In the vendor package the model is a separate `<script>` and is loaded by the silver theme on demand when using the CDN; for self-hosted builds it must be registered as a dependency and printed before the theme. Getting this wrong produces `Cannot read properties of undefined (reading 'Model')` at init.

### 7.4 `compat4x` design

`compat4x` is the successor to `compat3x`. It is not a port of `compat3x`; the 3.x → 4.x shim relies on v4 internals that no longer exist.

**Goal:** keep third-party plugins that target TinyMCE 4 alive long enough to migrate, without letting WordPress's own code depend on it.

**Bootstrap contract:**

- Loaded immediately after `tinymce.min.js`, before any editor or plugin initializes.
- Patches `tinymce.PluginManager.add` so that a v4 plugin's `init` receives a wrapped editor.
- Patches `tinymce.init` to translate removed settings before the editor is created.
- Never throws during load; every shim is individually guarded and logs once under `SCRIPT_DEBUG`.

**Patch points:**

| Patch point | Why | Risk |
|---|---|---|
| `tinymce.PluginManager.add` | Wrap `init(editor)` and inject v4 methods before the plugin runs | Medium: plugins may capture `tinymce` internals at load time, before init |
| `tinymce.init` / `EditorManager.init` | Translate settings, normalize `selector`, inject defaults | Low |
| `tinymce.EditorManager.createEditor` | Attach `editor.$`, `editor.settings`, `editor.buttons` before plugins initialize | Medium |
| `tinymce.WindowManager.prototype.open` | Accept v4 `{title, body, items, buttons}` schema | High: schema is rich |
| `tinymce.ui.Factory` | Provide a minimal control factory | High: cannot be complete |
| `tinymce.util.XHR` | Restore the removed helper for legacy plugins | Low |
| `tinymce.util.Promise` / `JSON` / `JSONRequest` | Restore removed helpers | Low |
| `tinymce.html.SaxParser` | Restore the removed parser | Medium: reimplement on top of `DomParser` |
| `tinymce.Env` | Add `ie`, `iOS`, `mac`, `webkit`, `gecko` | Low |
| `tinymce.isIE` / `isWebKit` | Restore removed globals | Low |

**Shim fidelity table.** "Best effort" means the shim preserves the common call shape, not every option.

| v4 API | v8 replacement | Fidelity | Notes |
|---|---|---|---|
| `editor.addButton(id, opts)` | `editor.ui.registry.addButton/addToggleButton` | High | Map `icon`, `image`, `text`, `tooltip`, `onclick`, `onPostRender`, `cmd`, `stateSelector`. `image` becomes an SVG data URI or a registered icon. |
| `editor.addMenuItem(id, opts)` | `editor.ui.registry.addMenuItem/addNestedMenuItem` | High | Map `context`, `menu`, `cmd`, `onclick`, `stateSelector`. |
| `editor.addContextToolbar` | native | High | Same name in v8; shim mainly normalizes predicate strings. |
| `editor.buttons` | internal registry | Medium | Expose a proxy object backed by the registry where possible. Reads work; arbitrary writes register a button. |
| `editor.settings` | `editor.options` | High | Proxy object with `get`, `set`, `has`, `unset`; reads fall back to `editor.options.get`. |
| `tinymce.$` / `editor.$` | none (use `tinymce.dom.DomQuery` replacement) | Medium | Provide a small jQuery-like wrapper over `querySelectorAll` for the subset WP and plugins use: `each`, `on`, `off`, `attr`, `css`, `addClass`, `removeClass`, `hasClass`, `find`, `closest`, `append`, `remove`, `show`, `hide`, `is`, `val`, `text`, `html`, `width`, `height`, `offset`, `scrollTop`. |
| `tinymce.editors` | `tinymce.EditorManager.get()` | High | Array-like proxy; index access and `.length` work. |
| `editor.theme.panel` | `editor.ui.registry` / DOM | Low | Cannot reproduce arbitrary panel trees. Shim only the WP floating-toolbar subset, or fail with a clear warning. |
| `editor.theme.resizeTo(w, h)` | CSS height on the editor container | Medium | Implement by setting the iframe/container height; no v8 theme resize API. |
| `tinymce.ui.Factory.add` / `Control.extend` | none | Low | Provide a registry that returns inert objects; custom controls (wplink's inline preview) must be ported. |
| `tinymce.ui.FloatPanel.hideAll()` / `.zIndex` | none | Low | Shim tracks known panels and hides their DOM; zIndex is a no-op constant. |
| `tinymce.WPWindowManager` | v8 `windowManager` | Medium | WP's wrapper can delegate to the native dialog; old `open({items, buttons})` needs a schema translator. |
| `editor.windowManager.open({url, width, height})` | `editor.windowManager.open({...})` with panel schema | Low–Medium | URL mode is gone; translate to an iframe panel. |
| `editor.windowManager.open({items: [...], buttons: [...]})` | panel schema | Low | Translate common item types: `textbox`, `listbox`, `checkbox`, `button`, `container`, `label`. |
| `tinymce.util.VK` | still present | High | No shim needed. |
| `tinymce.util.Delay` | still present | High | No shim needed. |
| `tinymce.util.Tools.resolve` | still present | High | No shim needed. |
| `tinymce.html.DomParser/Serializer/Schema/Writer` | still present | High | No shim needed. |
| `tinymce.html.SaxParser` | removed | Low | Reimplement a subset on `DomParser`; attribute callbacks only. |
| `tinymce.util.XHR` | removed | Medium | Wrap `fetch` with `send({url, type, data, success, error})`. |
| `tinymce.util.Promise` | removed | High | Return native `Promise`. |
| `tinymce.util.JSON` / `JSONRequest` | removed | High | Wrap `JSON` / `fetch`. |
| `tinymce.isIE` / `isWebKit` | removed | High | Constant booleans from `Env.browser`. |
| `Env.ie`, `Env.iOS`, `Env.mac`, `Env.webkit`, `Env.gecko` | `Env.browser` / `Env.os` | High | Define getters. `Env.ie = false` is safe because WP short-circuits `Env.ie && Env.ie < 11`. |
| `editor.fire()` | `editor.dispatch()` | High | `fire` still exists but is deprecated; shim can leave it. |
| `selection.setContent()` | still present, deprecated for v9 | High | No shim. |
| `editor.documentBaseUrl` | removed | Medium | Derive from `editor.options.get('document_base_url')`. |

**Settings translation.** `compat4x` rewrites removed options before init:

| v4 setting | v8 action |
|---|---|
| `theme: 'modern'` / `'inlite'` | `theme: 'silver'` |
| `skin: 'lightgray'` | `skin: 'oxide'` + WP content CSS |
| `toolbar1..9` | Keep (still supported), but map button names (Section 7.5). |
| `toolbar` (string) | Keep. |
| `resize: 'vertical'` | `resize: true` (or `'both'`), with a WP CSS constraint if vertical-only is required. |
| `forced_root_block: false` | Remove; use `forced_root_block: 'p'` plus `forced_root_block_attrs`. |
| `entity_encoding: 'raw'` | Keep; v8 supports it. |
| `element_format: 'xhtml'` | Keep for the transitional release. |
| `paste_*` legacy options | Translate the subset v8 still honors; otherwise map to `paste_preprocess`/`paste_postprocess`. |
| `tabfocus_elements` | Remove; v8 manages tab order. |
| `rtl_ui` | Remove; set `directionality: 'rtl'`. |
| `convert_urls`, `relative_urls`, `remove_script_host` | Keep. |
| `menubar: false` | Keep. |
| `branding: false` | Keep; also set `promotion: false`. |
| `license_key`, `api_key` | Inject `'gpl'` if absent or empty; drop `api_key` when the key is `'gpl'`; leave non-GPL keys alone (Section 7.12). |

**Removed-plugin stubs.** A v4 plugin list may still contain `paste`, `tabfocus`, `textpattern`, `hr`, `print`, `noneditable`, `colorpicker`, `contextmenu`, `textcolor`, `fullpage`, `spellchecker`, `imagetools`, `template`, `toc`. `compat4x` must:

- Silently drop plugins that are now core features (`paste`, `tabfocus`, `textpattern`, `hr`, `print`, `noneditable`).
- Drop removed plugins with a console warning (`fullpage`, `spellchecker`, `imagetools`, `template`, `toc`).
- Map `colorpicker` to native `forecolor`/`backcolor`.
- Map `contextmenu` to native context menus (no plugin needed).
- Map `textcolor` to `forecolor`/`backcolor`.

**Legacy DOM classes.** To keep third-party CSS working, `compat4x` adds v4 class names to the v8 chrome:

| v8 element | Legacy class added |
|---|---|
| `.tox-tinymce` | `mce-tinymce` |
| `.tox-editor-header` | `mce-toolbar-grp` |
| `.tox-toolbar-overlord` | `mce-toolbar` |
| `.tox-edit-area` | `mce-edit-area` |
| `.tox-statusbar` | `mce-statusbar` |
| `.tox-menu` | `mce-menu` |
| `.tox-dialog` | `mce-window` |
| `.tox-pop` | `mce-floatpanel` |
| `.tox-tbtn` | `mce-btn` |
| `.tox-toolbar__group` | `mce-btn-group` |

This is a transition aid, not a compatibility guarantee. It fixes selectors, not layout assumptions. A plugin that positions `.mce-toolbar-grp` absolutely will still be wrong.

**What `compat4x` cannot fix:**

- Plugins that reach into `editor.theme` and build panel trees.
- Plugins that depend on the exact v4 DOM structure or inline styles.
- Plugins that patch `tinymce.ui` prototypes.
- Plugins that use undocumented internals (`editor.selection.getSel()`, `editor.getDoc()`, and friends mostly still work, but not all).
- Plugins that rely on v4's `paste` plugin events or `contextmenu` internals.
- Plugins that bundle their own TinyMCE 4 and call `tinymce.init` twice.
- Skins/themes written for v4.

**Delivery:** `compat4x` ships in the feature plugin and in core for at least one major release. After that, it moves to an optional "TinyMCE 4 compatibility" plugin, then EOL. The deprecation schedule is in Section 11.

### 7.5 Toolbar, buttons, and icons

#### 7.5.1 The registry model

v8 replaces the imperative `editor.addButton()` / `editor.addMenuItem()` API with a declarative registry:

```js
editor.ui.registry.addButton('wp_more', {
    icon: 'wp-more',
    tooltip: 'Insert Read More tag',
    onAction: () => editor.insertContent('<!--more-->')
});
```

WordPress should create one module, `js/plugins/wordpress/ui.js`, that registers every WP button, menu item, and icon exactly once per editor. Registration must happen in the plugin's `init`, before the toolbar is rendered, and must be idempotent because the registry is per-editor.

Rules:

- **One registration site.** Do not scatter `addButton` calls across nine plugins. Each plugin exports a `register(editor)` function; `wordpress` calls them in a fixed order.
- **No feature detection by version string.** Detect `editor.ui && editor.ui.registry` and fall back to `compat4x` only in the feature plugin.
- **Every button has an `onAction` or a `toggle` handler.** v8 will not infer behavior from a command name the way v4 did.
- **Every toggle declares `onSetup`.** v8 requires an explicit state subscription:

```js
editor.ui.registry.addToggleButton('wp_adv', {
    icon: 'wp-adv',
    tooltip: 'Show more tools',
    onAction: () => toggleAdvanced(),
    onSetup: (api) => {
        const handler = () => api.setActive(isAdvancedVisible());
        editor.on('WpAdvToggle', handler);
        return () => editor.off('WpAdvToggle', handler);
    }
});
```

#### 7.5.2 Default toolbar mapping

The v4 defaults in `class-wp-editor.php` map as follows. "Custom" means WordPress registers it; "core" means v8 provides it.

| v4 name | v8 equivalent | Type | Notes |
|---|---|---|---|
| `formatselect` | `blocks` | core | Pass WP's `block_formats` string through. |
| `styleselect` | `styles` | core | Only if a site adds it via filter. |
| `fontselect` | `fontfamily` | core | Only via filter. |
| `fontsizeselect` | `fontsize` | core | Only via filter. |
| `bold`, `italic`, `underline`, `strikethrough` | same | core | Unchanged. |
| `bullist`, `numlist` | same | core (lists) | Keep `lists` plugin. |
| `blockquote` | same | core | Unchanged. |
| `alignleft`, `aligncenter`, `alignright`, `alignjustify` | same | core | Unchanged. |
| `outdent`, `indent` | same | core (lists) | Unchanged. |
| `undo`, `redo` | same | core | Unchanged. |
| `link`, `unlink` | same | core + WP | `wplink` overrides behavior. |
| `wp_more` | `wp_more` | custom | Inserts `<!--more-->`; must not be sanitized away. |
| `wp_page` | `wp_page` | custom | Inserts `<!--nextpage-->`. |
| `wp_help` | `wp_help` | custom | Opens the keyboard-shortcuts dialog. |
| `wp_code` | `wp_code` | custom | Opens the code editor for the current editor. |
| `wp_add_media` | `wp_add_media` | custom | Opens `wp.media`. |
| `dfw` | `dfw` | custom | Toggles distract-free writing. |
| `fullscreen` | `fullscreen` | core plugin | Keep plugin. |
| `hr` | `hr` | core command | Register a custom button calling `InsertHorizontalRule`. |
| `pastetext` | `pastetext` | custom | Calls `mceTogglePlainTextPaste`; there is no stock button. |
| `removeformat` | `removeformat` | core | Unchanged. |
| `charmap` | `charmap` | core plugin | Keep plugin. |
| `forecolor`, `backcolor` | same | core | Replaces `textcolor` + `colorpicker`. |
| `spellchecker` | none | custom / removed | See 7.5.3. |
| `wp_adv` | `wp_adv` | custom | See 7.5.4. |
| `image` | none | core | v8 has built-in image editing; the `image` plugin is gone. |
| `media` | none (WP) | custom | Use `wp.media`; do not ship the v8 `media` plugin unless a filter asks for it. |
| `wp_view` | `wp_view` | custom | Edit/remove embedded views. |
| `wp_image` | `wp_image` | custom | Edit image/caption. |
| `kitchensink` | `wp_adv` | custom | Alias used by some plugins; map to `wp_adv`. |

**Plugin list mapping.** The default `plugins` array becomes:

```
charmap, lists, fullscreen,
wordpress, wpautoresize, wpeditimage, wpemoji, wpgallery, wplink, wptextpattern, wpview
```

Removed from the default list: `colorpicker`, `hr`, `media`, `paste`, `tabfocus`, `textcolor`, `wpdialogs`, `image`. Each removal has a reason:

- `colorpicker`, `textcolor`: native color UI.
- `hr`: core command.
- `media`: WordPress uses `wp.media`; the v8 media dialog would duplicate it.
- `paste`: core.
- `tabfocus`: core.
- `wpdialogs`: v8 native dialogs; opt-in only (Section 7.6).
- `image`: core.

Sites that filtered `mce_plugins` to add these names must not fatal. `compat4x` drops or maps them (Section 7.4).

#### 7.5.3 What replaces `spellchecker`

TinyMCE 4's `spellchecker` plugin used a remote spellcheck service. It was removed years ago from the open-source distribution and is not coming back. v8 has `browser_spellcheck: true`, which delegates to the browser's native spellchecker.

Recommendation:

- Remove `spellchecker` from the default toolbar.
- Set `browser_spellcheck: true` by default.
- Keep a `mce_buttons` filter shim that maps `spellchecker` to a custom `wp_spellcheck` button which shows a one-time notice explaining that spellcheck is now provided by the browser and toggles `body.spellcheck` where supported. This preserves the button's presence for users who expect it without pretending to restore the old service.
- Do not ship a spellcheck server.

This is a visible behavior change and belongs in the dev notes.

#### 7.5.4 `wp_adv` and the second toolbar row

This is the highest-risk UI detail in the migration. In v4, `wp_adv` toggles the second toolbar row, and WordPress's CSS/JS assume `.mce-toolbar-grp` rows. v8 has:

- `toolbar1` … `toolbar9` (multiple rows still work);
- `toolbar_mode: 'floating' | 'sliding' | 'scrolling' | 'wrap'` (cannot be combined with multiple toolbars);
- a `ToggleToolbarDrawer` command registered by the silver theme;
- no public "hide toolbar row 2" API.

**Recommended approach (spike first):**

1. Keep `toolbar1` and `toolbar2` as separate rows.
2. Register `wp_adv` as a toggle button.
3. On action, toggle a class on the editor container: `wp-tinymce-adv-hidden`.
4. CSS hides the second `.tox-toolbar` row when that class is present.
5. Persist the user's choice in `getUserSetting('editor_advanced_toolbar')` (existing WP preference naming can be reused).

**Why this is only a recommendation:** the v8 toolbar DOM nests rows inside `.tox-toolbar-overlord` and may virtualize overflow. A CSS-only toggle can break if v8 re-renders the toolbar or moves buttons into a drawer. The spike must verify:

- the second row is a stable sibling;
- hiding it does not leave a gap or break the status bar;
- keyboard navigation skips hidden buttons;
- screen readers do not announce hidden controls;
- the toggle state survives editor re-init and DFW.

**Fallback A:** use `toolbar_mode: 'sliding'` with a single toolbar, and make `wp_adv` open a `addMenuButton` containing the advanced actions. This is robust but changes the interaction model.

**Fallback B:** keep all buttons in one `wrap` toolbar and make `wp_adv` toggle a "more" group. This is the closest to modern editor UX but the furthest from WordPress's current behavior.

Do not ship without the spike. This is a Phase 3 deliverable, not a Phase 8 surprise.

#### 7.5.5 Icons

WordPress's buttons use Dashicons CSS classes:

```js
editor.addButton('wp_more', { icon: 'dashicon dashicons-editor-more' });
```

v8 icon buttons accept only names registered in an icon pack, rendered as inline SVG. A CSS class in `icon` will render nothing.

Three options:

| Option | Description | Recommendation |
|---|---|---|
| A. Hand-author SVGs | Draw the ~20 WP-specific icons as 24×24 SVG paths in a `wp` icon pack. | **Recommended.** Full control, no font dependency, no license question beyond WordPress's own GPL. |
| B. Extract from Dashicons | Convert the Dashicons font glyphs to SVG paths at build time. | Viable, but font-to-SVG conversion is lossy and adds a build dependency. |
| C. Text buttons | Use `text: 'More'` etc. | Poor UX; acceptable as a fallback only. |

Register the pack once:

```js
tinymce.IconManager.add('wp', {
    icons: {
        'wp-more': '<svg ...>...</svg>',
        'wp-page': '<svg ...>...</svg>',
        'wp-help': '<svg ...>...</svg>',
        'wp-adv': '<svg ...>...</svg>',
        'wp-media': '<svg ...>...</svg>',
        'wp-image': '<svg ...>...</svg>',
        'wp-view': '<svg ...>...</svg>',
        'wp-dfw': '<svg ...>...</svg>'
    }
});
```

The icon pack must be loaded before any editor initializes. Put it in `js/plugins/wordpress/icons.js` and enqueue it as a dependency of the `wordpress` plugin, or inline it in `wp_tinymce_inline_scripts()` to avoid an extra request.

Accessibility: every icon button needs a `tooltip` and an `aria-label` derived from it. v8 does this if `tooltip` is set; verify with the accessibility audit.

### 7.6 Dialogs, link, image, media, and galleries

#### 7.6.1 What is actually a TinyMCE dialog

A common misreading of the migration is that all WordPress dialogs must be rewritten. They do not.

| UI | Implementation today | v8 impact |
|---|---|---|
| Link insertion/edit | WordPress `wp-link` modal (`wp-includes/js/wplink.js`), opened by the `wplink` plugin | **Low.** The modal stays. Only the inline toolbar around the link is TinyMCE UI. |
| Media library | `wp.media` modal | **None.** It is a WordPress modal, not a TinyMCE window. |
| Image edit/replace | `wpeditimage` + `wp.media` | **Low.** Port the inline toolbar and parser calls. |
| Gallery edit | `wpgallery` + `wp.media` | **Low.** Mostly DOM/selection API. |
| Keyboard shortcuts help | `editor.windowManager.open({items, buttons})` in `wordpress` | **High.** Must become a v8 panel dialog. |
| WP dialogs wrapper | `wpdialogs` overrides `windowManager` with jQuery UI | **High / removable.** Drop from default; v8 native dialogs. |
| Third-party plugin dialogs | Old `windowManager` schema | **High.** `compat4x` best-effort translator. |

So the native dialog work is bounded: the help dialog, the `wpdialogs` removal, and any `wordpress` plugin prompts. The big modals are already WordPress-owned.

#### 7.6.2 v8 dialog schema

The v8 schema is declarative:

```js
editor.windowManager.open({
    title: 'Keyboard Shortcuts',
    size: 'medium',
    body: {
        type: 'panel',
        items: [
            { type: 'htmlpanel', html: shortcutsHtml }
        ]
    },
    buttons: [
        { type: 'cancel', text: 'Close' }
    ]
});
```

Rules:

- `body` is a panel, not an array of v4 controls.
- Buttons use `type: 'submit' | 'cancel' | 'custom'`, not `text` + `onclick` only.
- `onSubmit` receives `(api)` and reads `api.getData()`.
- `onAction` on a custom button receives `(buttonApi, dialogApi)`.
- There is no `url` mode. If a plugin needs an iframe, use `{ type: 'iframe', url }` inside a panel and size the dialog explicitly.
- There is no `items` array at the top level.

#### 7.6.3 `wpdialogs` disposition

`wpdialogs` exists because WordPress wanted jQuery UI-styled dialogs and because v4's window manager was inflexible. v8's dialogs are accessible, focus-trapped, and themeable. Keeping the jQuery UI override would fight the new UI and reintroduce the accessibility problems v8 fixes.

**Recommendation:**

1. Remove `wpdialogs` from the default plugin list in the feature plugin.
2. Keep the file as an **opt-in** plugin for third-party code that calls `editor.windowManager.open()` with the v4 schema, implemented as a schema translator on top of v8's native dialog, not jQuery UI.
3. Deprecate it in the dev notes with a two-release window.
4. Remove it from core in the release after the migration.

#### 7.6.4 Link inline toolbar

`wplink` builds a floating toolbar with `tinymce.ui.Factory` and `tinymce.ui.Control.extend`. That API is gone. The rewrite:

- Build the toolbar as a plain DOM node positioned with `editor.dom.getPos()` / `getRect()`.
- Reuse WordPress's existing `.wp-link-input` / `.wp-link-preview` markup and CSS.
- Use `editor.on('NodeChange')` and `editor.on('SelectionChange')` to decide visibility.
- Keep `window.wpLink.open(editor.id)` for the modal.
- Use `editor.dispatch('wptoolbar', { toolbar })` so the existing `wordpress` toolbar manager can show/hide it.

The `wordpress` plugin's toolbar manager is the single owner of floating toolbars. `wplink`, `wpeditimage`, and `wpview` should register toolbars with it rather than each creating their own. This is a cleanup that the migration forces, and it reduces the v8 port to one toolbar implementation.

#### 7.6.5 Images and captions

`wpeditimage` is mostly DOM and `wp.media` work. The v8-sensitive parts are:

- `editor.parser.parse(caption, { forced_root_block: false })`: the v8 type definition still accepts `boolean | string`, and v8's own parser uses `false` internally. Keep the call, add a runtime test, and fall back to `editor.parser.parse(caption, { forced_root_block: 'p' })` + unwrapping if it changes output.
- `tinymce.html.Serializer`: still present. Keep.
- `editor.dom`: still present. Keep.
- `editor.selection.getNode()` / `getContent()`: still present.
- The inline toolbar: same rewrite as `wplink`.
- `editor.settings.classic_block_editor`: replace with `editor.options.get('classic_block_editor')` or a WP-owned option passed through `wp.editor`.

Caption round-tripping is a golden-file test. The serializer must produce the same `[caption]` shortcode and `<img>` attributes as v4 for the corpus.

#### 7.6.6 Galleries

`wpgallery` is the lowest-risk plugin. It:

- detects `[gallery]` shortcodes in the content;
- replaces them with a placeholder view;
- opens `wp.media` for editing;
- re-serializes the shortcode.

The only v8 work is `tinymce.editors` → `EditorManager.get()`, `Env` fields, and the toolbar. Keep the shortcode format unchanged.

#### 7.6.7 Media buttons

`wp_add_media` and the media modal are WordPress-owned. The `wordpress` plugin's `wp-media-library` button opens `wp.media.editor.open(editor.id)`. No v8 dialog work. The button must be registered with a v8 icon (Section 7.5.5).

### 7.7 Content behaviors

#### 7.7.1 Paste

TinyMCE 4's `paste` plugin is now core. WordPress's paste filters already listen to `PastePreProcess` in `wordpress/plugin.js`, which v8 still fires. The work is:

1. Remove `paste` from the plugin list.
2. Replace `editor.settings.paste_plaintext_inform` with `editor.options.get('paste_plaintext_inform')` or a WP-owned setting.
3. Keep WP's Word cleanup filters, but test them against v8's stricter sanitizer.
4. Decide `paste_as_text` default. WordPress currently defaults to rich paste with cleanup. Keep that.
5. Test pasting from Word, Google Docs, LibreOffice, VS Code, and a web page. v8's DOM purification is stricter; some markup that survived v4 will be dropped. Document the differences.

`mceTogglePlainTextPaste` still exists in v8 core, so the `pastetext` button can be preserved as a custom button.

#### 7.7.2 Text patterns

WordPress's `wptextpattern` plugin implements `#` headings, `>` blockquote, `-`/`1.` lists, and `` ` `` code, with WP-specific behavior and undo handling. v8 has built-in `text_patterns`, but they differ:

- v8 triggers on Space, WordPress triggers on Space and Enter in some patterns.
- v8's pattern set and undo granularity differ.
- WordPress's pattern behavior is part of its editing contract.

**Recommendation:** keep `wptextpattern` as the owner, set `text_patterns: false` in the editor settings, and port the plugin to v8 events (`keydown`, `input`, `BeforeInput`). Do not run both engines; double-firing produces duplicated transformations.

Port details:

- `editor.settings.wptextpattern` → `editor.options.get('wptextpattern')`.
- Replace `editor.on('keydown')` handling only where v8's event order changed; keep `Space`/`Enter` semantics.
- Use `editor.undoManager.transact()` around transformations.
- Add tests for each pattern, including undo/redo and IME composition.

#### 7.7.3 Autoresize

WordPress's `wpautoresize` sets a minimum height, grows the editor, and coordinates with DFW. v8 has an `autoresize` plugin with `min_height`, `max_height`, `autoresize_bottom_margin`, and `autoresize_overflow_padding`.

Two options:

| Option | Pros | Cons |
|---|---|---|
| Port `wpautoresize` | Exact WP behavior; DFW integration stays | More custom code; must handle v8 iframe sizing |
| Use v8 `autoresize` + thin WP layer | Less code; upstream-tested | Behavior differences; DFW coordination still custom |

**Recommendation:** use v8 `autoresize` for growth, and keep a thin `wpautoresize` only for DFW and the `wp-editor-area` textarea sync. Delete duplicated height logic. Measure the result against the current behavior at 320 px, 768 px, and 1440 px widths.

#### 7.7.4 `wpview` (embeds and views)

`wpview` replaces embeds and other views with non-editable placeholders. v8 changes:

- `tinymce.editors` → `EditorManager.get()`.
- `tinymce.Env.ie` → `Env.browser.isIE()`; IE is no longer supported, so most branches can be deleted.
- `skins/lightgray/content.min.css` → the v8 content CSS.
- `tinymce.html.*` still exists; keep the parser/serializer usage.
- The placeholder DOM must remain `contenteditable=false` and must survive v8's sanitizer. Test `[embed]`, YouTube, Twitter/X, and plain URLs.

`wpview` is also the owner of the "edit/remove" inline toolbar for views. Reuse the unified toolbar from 7.6.4.

#### 7.7.5 Emoji

`wpemoji` replaces emoji characters with Twemoji images in the editor. It uses `editor.on('PreInit')` and content filters. v8's stricter sanitizer may strip `img` attributes or classes. Test:

- emoji in paragraphs, headings, lists, and captions;
- emoji inside links;
- emoji with skin-tone modifiers;
- emoji in pasted content;
- `wp_staticize_emoji()` output.

If v8's sanitizer strips the emoji `<img>` attributes, add them to `extended_valid_elements` rather than weakening the sanitizer globally.

#### 7.7.6 Shortcodes and `wp_more`

`wp_more` and `wp_page` insert HTML comments. v8's default `element_format: 'html'` and sanitizer must preserve them. WordPress already sets `entity_encoding: 'raw'`. Keep `element_format: 'xhtml'` for the transitional release to minimize serialization diffs, and add golden tests for:

- `<!--more-->` and `<!--nextpage-->`;
- `[caption]`, `[gallery]`, `[embed]`;
- custom shortcodes with attributes;
- `<br>` vs `<br />`;
- non-breaking spaces and entities.

### 7.8 CSS architecture

The v4 chrome and the v8 chrome are structurally different. A global `.mce-*` → `.tox-*` replacement is not safe.

**Layers:**

1. **WordPress chrome:** `.wp-editor-wrap`, `.wp-editor-tools`, `.wp-editor-area`, `.wp-media-buttons`, `.wp-editor-expand`. Unchanged.
2. **TinyMCE contract:** a small documented set of v8 selectors:
   - `.tox-tinymce`
   - `.tox-editor-header`
   - `.tox-toolbar-overlord`
   - `.tox-toolbar__primary`
   - `.tox-toolbar__group`
   - `.tox-edit-area`
   - `.tox-statusbar`
   - `.tox-tbtn`
   - `.tox-menu`
   - `.tox-collection`
   - `.tox-dialog`
   - `.tox-pop`
   - `.tox-tooltip`
3. **Content:** `.mce-content-body`, `.mce-item-table`, `.mce-item-anchor`, `.mce-shim`, plus WordPress content classes (`.wp-caption`, `.gallery`, `.alignleft`, `.alignright`, `.aligncenter`, `.wp-view`).
4. **Transitional aliases:** only in `compat4x.css`, only in the feature plugin, removed before core merge.

**What must be rewritten in `src/wp-includes/css/editor.css`:**

- Editor container sizing and borders (`.mce-tinymce` → `.tox-tinymce`).
- Toolbar background, padding, and button states (`.mce-toolbar-grp`, `.mce-btn` → `.tox-toolbar`, `.tox-tbtn`).
- Edit area and iframe background (`.mce-edit-area` → `.tox-edit-area`).
- Status bar (`.mce-statusbar` → `.tox-statusbar`).
- Floating panels and tooltips (`.mce-floatpanel`, `.mce-tooltip` → `.tox-pop`, `.tox-tooltip`).
- Menus (`.mce-menu` → `.tox-menu`, `.tox-collection`).
- Dialogs (`.mce-window` → `.tox-dialog`).
- Icon buttons (`.mce-i-*` → v8 SVG; delete Dashicons editor CSS that is no longer used).
- RTL (`.mce-rtl` → `[dir=rtl]`, `--tox-*` variables).

**What must be rewritten elsewhere:**

- `src/wp-admin/css/edit.css`: 10 `.mce-*` rules for the editor wrap, DFW, and mobile.
- `src/wp-admin/css/customize-widgets.css`: 2 rules for the widget editor.
- Theme editor styles: `.mce-item-table`, `.mce-content-body` are used by block themes and the Classic block. Keep the content classes stable; they are part of the content contract.
- Gutenberg `editor.scss`: `.mce-edit-area`, `.mce-tinymce`, `.mce-container-body`. Either add legacy classes in `compat4x` or land a Gutenberg PR. Do both during the transition; the Gutenberg PR is required before compat4x is removed.

**Skin strategy.** Use the stock `oxide` skin with a WordPress override stylesheet. Do not fork the skin. Override:

- toolbar height and button spacing;
- focus ring color;
- dialog radius/shadow to match WP admin;
- status bar typography;
- mobile breakpoints.

A custom skin is a maintenance liability and will drift from upstream. If WordPress needs a dark mode, use `oxide-dark` and a small variable override, not a fork.

### 7.9 Gutenberg Classic block

The Classic block (`core/freeform`) is the only block-editor consumer of TinyMCE. It:

- reads `window.wpEditorL10n.tinymce` for settings and strings;
- calls `tinymce.EditorManager.overrideDefaults()`;
- uses `wp.oldEditor.initialize()`, `remove()`, and `getContent()`;
- relies on `.mce-edit-area`, `.mce-tinymce`, and `.mce-container-body` in `editor.scss`.

**What must change in Gutenberg:**

1. The `editor.scss` selectors, either natively or via legacy classes.
2. Any assumption that `wp.oldEditor` initializes synchronously. v8 still does, but the DOM model and theme load asynchronously; the Classic block must wait for the `init` event before measuring or focusing.
3. `overrideDefaults` still exists, so `baseURL`/`suffix` injection can stay.
4. The Classic block's toolbar is the WordPress toolbar, so all of Section 7.5 applies.
5. The block's `onFocus`/`onBlur` and sidebar integration must be tested with v8's new focus management.

**Coordination:** the core merge must be paired with a Gutenberg PR. Do not rely on `compat4x` legacy classes for a Gutenberg release; Gutenberg ships independently and may update before or after core.

### 7.10 Build and packaging

Current `Gruntfile.js` behavior:

- `copy:vendor-js` copies `src/js/_enqueues/vendor/tinymce/**` to `build/wp-includes/js/tinymce/`, excluding `tinymce.js`, then copies `tinymce.js` separately for `src`.
- `uglify:core` minifies `plugins/wordpress/plugin.js` and `plugins/wp*/plugin.js`.
- `concat:tinymce` builds `wp-tinymce.js` from `themes/modern/theme.min.js` plus plugins. WordPress 7.2 no longer registers that bundle, so this task is legacy.
- `build:js` runs `concat:tinymce`.

**Target build:**

1. Vendor copy includes:
   - `tinymce.min.js`
   - `models/dom/model.min.js`
   - `themes/silver/theme.min.js`
   - `skins/ui/oxide/**`
   - `skins/content/default/**`
   - `icons/default/icons.min.js`
   - `plugins/{charmap,lists,fullscreen,autolink,autoresize,code,image,link,media,table,wordcount,...}/plugin.min.js`
   - `license.md`, `notices.txt`
2. Remove `concat:tinymce` and the `wp-tinymce.js` build. If a legacy bundle is still needed for one release, generate it from v8 files only and mark it deprecated.
3. Add an icon build step: `js/plugins/wordpress/icons.js` is authored, not generated, unless option B in 7.5.5 is chosen.
4. Keep `uglify:core` for WP plugins. Do not minify vendor twice.
5. Add a size check to CI: fail if the gzipped editor core exceeds the budget in Section 13.
6. Add a license check: `license.md` and `notices.txt` must be present in the build.
7. Update `package.json` / `composer.json` if TinyMCE is pinned there (it currently is not; the vendor tree is checked in).

**Versioning:** `$tinymce_version = '8100-20261025'` (or the actual 8.10.x release date). The suffix is used for cache busting. Bump it whenever the vendor tree changes.

**SVN/Git:** the vendor tree is large. Removing v4 and adding v8 in one commit produces an enormous diff. Prefer two commits: delete v4 (with a build that fails loudly), then add v8. Reviewers should review the WP-owned code separately from the vendor import.

### 7.11 Script registration and loading

`wp_register_tinymce_scripts()` currently registers `wp-tinymce-root`, `wp-tinymce` (compat3x), and `wp-tinymce-lists`. The v8 version:

```php
wp_register_script( 'wp-tinymce-root', includes_url( 'js/tinymce/tinymce.min.js' ), array(), $tinymce_version, true );
wp_register_script( 'wp-tinymce-model', includes_url( 'js/tinymce/models/dom/model.min.js' ), array( 'wp-tinymce-root' ), $tinymce_version, true );
wp_register_script( 'wp-tinymce-theme', includes_url( 'js/tinymce/themes/silver/theme.min.js' ), array( 'wp-tinymce-model' ), $tinymce_version, true );
wp_register_script( 'wp-tinymce-icons', includes_url( 'js/tinymce/icons/default/icons.min.js' ), array( 'wp-tinymce-theme' ), $tinymce_version, true );
wp_register_script( 'wp-tinymce', includes_url( 'js/tinymce/plugins/compat4x/plugin.min.js' ), array( 'wp-tinymce-icons' ), $tinymce_version, true );
wp_register_script( 'wp-tinymce-lists', includes_url( 'js/tinymce/plugins/lists/plugin.min.js' ), array( 'wp-tinymce' ), $tinymce_version, true );
```

Notes:

- The exact dependency chain must be verified against v8's runtime. The model must be available before the theme initializes; if v8's silver theme loads the model itself, the dependency can be simplified, but the script must still be printed.
- `wp-tinymce` is the compatibility layer. In core after the native port, it can become a no-op or be removed; third-party plugins that expect it should be handled by `compat4x`.
- `force_uncompressed_tinymce()` re-registers scripts with `.js` instead of `.min.js`. It must be updated for the new file list and must not re-register the removed `wp-tinymce.js` bundle.
- `wp_mce_translation()` must use `tinymce.ScriptLoader.markDone()` after loading the language file. v8 still has `ScriptLoader.markDone`, verified.
- The language file URL must use the RFC 5646 form (`en-GB.js`). Keep a fallback to `en_GB.js` for 8.x.

**Load order in `editor_js()`:**

1. `tinyMCEPreInit` inline script (settings, baseURL, suffix, license).
2. `wp-tinymce-root`.
3. model, theme, icons.
4. `compat4x` (if present).
5. `lists` and any other stock plugins.
6. WP plugins (`wordpress`, `wp*`).
7. `wp-tinymce` bootstrap that calls `tinymce.init()` per editor.

Do not rely on `wp-tinymce.js` as a bundle. WordPress 7.2 already moved away from it; the v8 migration completes that move.

### 7.12 Security boundaries

v8 tightens content sanitization in ways that affect WordPress:

- **DOMPurify 3.3.2 with `SAFE_FOR_XML`**: stricter about XML-invalid characters and some attributes.
- **`sandbox_iframes` defaults to true** in v7+. WordPress embeds iframes (YouTube, etc.) through `wpview` and `the_content`. If iframes are sandboxed by default, embeds may break. Decide:
  - keep sandboxing and add `sandbox` attributes/allowlists for known providers;
  - disable sandboxing globally (`sandbox_iframes: false`) to preserve current behavior;
  - disable per editor via a filter.
- **`convert_unsafe_embeds` defaults to true**: converts `<object>`/`<embed>` to `<iframe>`. WordPress may rely on object/embed for old content. Test and decide.
- **`valid_elements` / `extended_valid_elements`**: WordPress's allowed tags must be re-checked against v8's schema. Do not widen the schema to compensate for a sanitizer bug; fix the specific element.
- **`entity_encoding: 'raw'`** is kept; verify that v8 does not double-encode.
- **URL handling**: `convert_urls: false`, `relative_urls: false`, `remove_script_host: false` are kept. v8's URL parser is stricter; test protocol-relative URLs, `mailto:`, `tel:`, and custom schemes.
- **Paste**: v8 sanitizes pasted content more aggressively. This is a security improvement, but it can drop legitimate markup. Document the allowed set.
- **`license_key: 'gpl'`** must be present or the editor is disabled. v8 decides how to validate the license from two options (verified in `tinymce@8.10.0`):

  | `license_key` | `api_key` | Result |
  |---|---|---|
  | `'gpl'` | not set | Offline GPL mode. Editor works. |
  | not set | any | Editor disabled ("license key has not been provided"). |
  | `''` or any non-GPL string | any | Needs the commercial `licensekeymanager` plugin; without it the editor is disabled. |
  | `'gpl'` | set | Switches to "online" mode and needs `licensekeymanager`; without it the editor is disabled. |

  So a single stray `api_key` from a plugin's `tiny_mce_before_init` filter (for example, a plugin that once targeted Tiny Cloud) disables the editor even though core set `'gpl'`. Policy:

  1. **PHP** (`WP_Editor::editor_settings()`, after `tiny_mce_before_init`, and the Classic block settings in `wp_tinymce_inline_scripts()`):
     - if `license_key` is missing or an empty string, set it to `'gpl'`;
     - if `license_key` is `'gpl'` and `api_key` is set, remove `api_key` and call `_doing_it_wrong()` naming the filter. A GPL key with an API key can never work, so removing it is safe.
     - if `license_key` is a non-GPL string, leave both options alone. The site has a commercial license and is responsible for loading `licensekeymanager`.
  2. **JS** (`compat4x`, wrapping `tinymce.init()` and `wp.editor.initialize()`): apply the same three rules to settings changed in JS (`wp-before-tinymce-init`, Classic block), and log a `console.warn` in `SCRIPT_DEBUG`.
  3. Never ship or generate a commercial key, and never print one in page HTML that core generated.

---

## 8. Phased execution plan

### 8.1 Team model

The plan assumes a small core team plus sponsored contributors. Roles are responsibilities, not full-time hires; one person may hold several.

| Role | Responsibility | Suggested allocation |
|---|---|---|
| **Lead / architect** | Decisions, reviews, core coordination, release gates | 0.5 FTE |
| **PHP integrator** | `class-wp-editor.php`, `script-loader.php`, settings, filters, tests | 0.6 FTE |
| **Editor JS engineer** | `compat4x`, WP plugins, `base.js`, `dfw.js`, `mce-view.js` | 1.0 FTE |
| **UI/CSS engineer** | `.tox-*` rewrite, skin overrides, responsive, RTL | 0.6 FTE |
| **QA / automation** | PHPUnit, QUnit, Playwright, visual regression, compatibility matrix | 0.8 FTE |
| **Accessibility reviewer** | Audit, keyboard/focus/ARIA, sign-off | 0.2 FTE |
| **Security reviewer** | Sanitizer, iframes, paste, URL handling, sign-off | 0.15 FTE |
| **Docs / community** | Dev notes, migration guide, plugin outreach, office hours | 0.4 FTE |
| **Gutenberg liaison** | Classic block, `editor.scss`, Gutenberg releases | 0.15 FTE |

Total: roughly **4.4 FTE** at peak.

### 8.2 Phase overview

| Phase | Name | Duration (4 contributors) | Effort (person-weeks) | Primary output |
|---|---|---|---|---|
| 0 | Charter and baseline | 3 weeks | 2 | Approved charter, corpus, metrics |
| 1 | Vendor import and boot spike | 4 weeks | 5 | v8 boots in a feature plugin |
| 2 | `compat4x` alpha | 8 weeks | 10 | Compatibility bridge + fixture suite |
| 3 | Native UI port | 10 weeks | 12 | Buttons, icons, toolbars, dialogs |
| 4 | Plugin-by-plugin port | 12 weeks | 14 | Nine WP plugins on v8 APIs |
| 5 | Content parity and CSS | 10 weeks | 10 | Golden files, `.tox-*` styles |
| 6 | Gutenberg integration | 4 weeks | 4 | Classic block green |
| 7 | Feature-plugin beta and ecosystem | 10 weeks | 8 | Public beta, compatibility data |
| 8 | Core integration | 10 weeks | 10 | v8 in `wordpress-develop` |
| 9 | Core beta/RC hardening | 12 weeks | 12 | Release candidate quality |
| 10 | Release and deprecation | ongoing | 4 | Shipped release, rollback plan |
| | **Total** | **~12 months** | **91** | |

Phases overlap. Phase 3 starts while Phase 2 is still hardening; Phase 5 starts while Phase 4 is finishing; Phase 7 overlaps 5 and 6. The critical path is **1 → 2 → 3 → 4 → 5 → 8 → 9**.

### 8.3 Phase 0 — Charter and baseline (3 weeks, 2 person-weeks)

**Purpose:** make the project legible and measurable before any code changes.

| ID | Task | Owner | Effort | Output |
|---|---|---|---|---|
| P0.1 | Publish an RFC/dev note describing the migration, scope, and non-goals | Lead | 2d | Public post |
| P0.2 | Name maintainers for each workstream | Lead | 1d | Owners table |
| P0.3 | Freeze the v4 baseline: bundle sizes, init time, editor counts, browser matrix | QA | 3d | Baseline report |
| P0.4 | Build the content corpus (see 10.3) | QA + docs | 3d | `tests/fixtures/content/` |
| P0.5 | Stand up the compatibility tracker (spreadsheet or GitHub project) | Docs | 1d | Public tracker |
| P0.6 | Confirm licensing and redistribution obligations for v8 | Lead + legal | 1d | Decision note |
| P0.7 | Create the feature plugin repository and CI | JS engineer | 2d | Repo with lint/test/build |
| P0.8 | Define performance, accessibility, and compatibility budgets | Lead + QA | 1d | Budgets in Section 13 |

**Gate G0:** charter approved, owners named, baseline report published, corpus frozen, CI green on an empty plugin.

### 8.4 Phase 1 — Vendor import and boot spike (4 weeks, 5 person-weeks)

**Purpose:** prove that v8 can boot inside WordPress's script system before porting anything.

| ID | Task | Owner | Effort | Output |
|---|---|---|---|---|
| P1.1 | Vendor 8.10.x into the feature plugin with `license.md` and `notices.txt` | JS engineer | 1d | Vendor tree |
| P1.2 | Register `wp-tinymce-root`, model, theme, icons, skin, content CSS | PHP integrator | 3d | `class-wp-tinymce8-scripts.php` |
| P1.3 | Emit `tinyMCEPreInit` with `license_key: 'gpl'`, `promotion: false`, `branding: false`, `base_url`, `suffix` | PHP integrator | 2d | Inline script |
| P1.4 | Boot a bare editor with stock silver/oxide and no WP plugins | JS engineer | 2d | Spike page |
| P1.5 | Verify `EditorManager.overrideDefaults`, `ScriptLoader.markDone`, language loading | JS engineer | 2d | Notes |
| P1.6 | Measure payload and init time against the baseline | QA | 2d | Metrics |
| P1.7 | Test the supported browser matrix, including Safari/iOS and Firefox ESR | QA | 3d | Browser report |
| P1.8 | Document every console error and load-order failure | JS engineer | 1d | Spike report |

**Gate G1:** editor boots in `wp-admin` and front-end `wp_editor()` with zero console errors; `license_key` behavior verified; payload measured; no blocker for Phase 2.

**Stop condition:** if v8 cannot boot without patching vendor code in more than two places, stop and re-evaluate the vendor strategy before writing `compat4x`.

### 8.5 Phase 2 — `compat4x` alpha (8 weeks, 10 person-weeks)

**Purpose:** give third-party plugins a working bridge and learn what the ecosystem actually uses.

| ID | Task | Owner | Effort | Output |
|---|---|---|---|---|
| P2.1 | Bootstrap: patch `PluginManager.add`, `EditorManager.createEditor`, `tinymce.init` | JS engineer | 4d | `plugin.js` skeleton |
| P2.2 | Settings translation table (Section 7.4) | JS engineer | 3d | Translation module |
| P2.3 | `addButton` / `addMenuItem` / `editor.buttons` adapters | JS engineer | 5d | Adapter module |
| P2.4 | `editor.settings`, `tinymce.$`, `editor.$` shims | JS engineer | 4d | Shim module |
| P2.5 | `Env`, `isIE`, `isWebKit`, `tinymce.editors` shims | JS engineer | 2d | Shim module |
| P2.6 | `util.XHR`, `util.Promise`, `util.JSON`, `util.JSONRequest`, `html.SaxParser` | JS engineer | 4d | Utility module |
| P2.7 | `windowManager.open` v4-schema translator | JS engineer | 6d | Dialog module |
| P2.8 | `ui.Factory` / `ui.Control` / `FloatPanel` best-effort | JS engineer | 5d | UI shim |
| P2.9 | Removed-plugin stubs and legacy `.mce-*` classes | JS engineer | 3d | Compat layer |
| P2.10 | Fixture suite: 30 small plugins, each exercising one API | QA | 5d | `tests/compat/` |
| P2.11 | Instrumentation: log unsupported API calls under `SCRIPT_DEBUG` | JS engineer | 1d | Telemetry |
| P2.12 | Draft the third-party migration guide | Docs | 3d | `MIGRATION.md` |

**Gate G2:** 30/30 fixtures load without fatal errors; ≥90% pass their behavioral assertion; every unsupported API logs a clear message; no shim is required by WordPress's own plugins.

### 8.6 Phase 3 — Native UI port (10 weeks, 12 person-weeks)

**Purpose:** replace the v4 UI layer in WordPress's own code.

| ID | Task | Owner | Effort | Output |
|---|---|---|---|---|
| P3.1 | Author the WP SVG icon pack | UI engineer | 3d | `icons.js` |
| P3.2 | Build the button/menu registration module | JS engineer | 5d | `ui.js` |
| P3.3 | Map every default toolbar name (Section 7.5.2) | JS engineer + PHP | 3d | Mapping table + code |
| P3.4 | `wp_adv` spike: CSS row toggle vs. drawer vs. menu | JS engineer + UI | 5d | Decision + prototype |
| P3.5 | Implement the chosen `wp_adv` behavior | JS engineer | 4d | Working toggle |
| P3.6 | Unified floating-toolbar manager | JS engineer | 5d | `editor.wp._createToolbar` replacement |
| P3.7 | Port `wplink` inline toolbar | JS engineer | 5d | Working link UI |
| P3.8 | Port `wpeditimage` inline toolbar | JS engineer | 4d | Working image UI |
| P3.9 | Port `wpview` inline toolbar | JS engineer | 2d | Working view UI |
| P3.10 | Port the help dialog to the v8 panel schema | JS engineer | 2d | Working dialog |
| P3.11 | Remove `wpdialogs` from the default list; build opt-in translator | JS engineer | 3d | Decision + code |
| P3.12 | Keyboard navigation and focus-return tests | QA + a11y | 3d | Test report |

**Gate G3:** every default button performs its action; `wp_adv` is decided and works; floating toolbars position correctly at all breakpoints; keyboard-only operation passes; no `tinymce.ui.*` call remains in WP-owned UI code.

### 8.7 Phase 4 — Plugin-by-plugin native port (12 weeks, 14 person-weeks)

**Purpose:** remove every v4-only API from the nine WordPress plugins.

| ID | Plugin | Key work | Effort |
|---|---|---|---|
| P4.1 | `wordpress` | Button registry, commands, shortcuts, paste filters, media, DFW hook, help | 8d |
| P4.2 | `wplink` | Inline toolbar DOM rewrite, `wpLink` integration, preview | 5d |
| P4.3 | `wpeditimage` | Parser/serializer verification, caption round-trip, `wp.media` | 4d |
| P4.4 | `wpview` | `EditorManager`, `Env`, content CSS, placeholder sanitization | 3d |
| P4.5 | `wptextpattern` | Event order, undo transactions, `text_patterns: false` | 3d |
| P4.6 | `wpautoresize` | Native `autoresize` integration, DFW sizing | 2d |
| P4.7 | `wpemoji` | Sanitizer allowlist, filters | 1d |
| P4.8 | `wpgallery` | Selection/DOM updates | 1d |
| P4.9 | `wpdialogs` | Opt-in translator or removal | 2d |
| P4.10 | Cross-plugin | Shared helpers, remove duplicated toolbar code | 3d |

**Gate G4:** code search finds no `addButton`, `addMenuItem`, `tinymce.ui.`, `editor.settings`, `tinymce.$`, `editor.theme.`, `tinymce.editors`, or `Env.ie` in `js/plugins/wp*/`; each plugin's QUnit suite passes; manual smoke test on Classic, Classic block, widgets, and front-end editors.

### 8.8 Phase 5 — Content parity and CSS (10 weeks, 10 person-weeks)

**Purpose:** prove that stored content and the visual editor look the same.

| ID | Task | Owner | Effort | Output |
|---|---|---|---|---|
| P5.1 | Rewrite `editor.css` for `.tox-*` | UI engineer | 8d | New stylesheet |
| P5.2 | Update `edit.css`, `customize-widgets.css` | UI engineer | 2d | Updated styles |
| P5.3 | Content CSS: `.mce-content-body`, tables, captions, galleries | UI engineer | 3d | `content.css` |
| P5.4 | RTL pass | UI engineer | 2d | RTL report |
| P5.5 | Responsive pass at 320/768/1024/1440 | UI + QA | 3d | Screenshots |
| P5.6 | Golden-file corpus for serialization | QA | 4d | Test suite |
| P5.7 | Paste matrix: Word, Google Docs, LibreOffice, web pages | QA | 3d | Report |
| P5.8 | Shortcode/comment/entity round-trip | QA | 2d | Test suite |
| P5.9 | Visual regression baseline | QA | 3d | Snapshots |
| P5.10 | Fix all P1/P2 visual and content diffs | Team | 5d | Green suite |

**Gate G5:** corpus is byte-stable or every diff is approved; no P1/P2 visual regressions; RTL and responsive pass; paste behavior documented.

### 8.9 Phase 6 — Gutenberg integration (4 weeks, 4 person-weeks)

| ID | Task | Owner | Effort | Output |
|---|---|---|---|---|
| P6.1 | Run the Classic block E2E suite against the feature plugin | Gutenberg liaison | 3d | Results |
| P6.2 | Update `editor.scss` selectors | Gutenberg liaison | 2d | Gutenberg PR |
| P6.3 | Verify `overrideDefaults`, `baseURL`, `suffix` | JS engineer | 1d | Notes |
| P6.4 | Fix focus/measure/init timing | Gutenberg liaison | 3d | Patch |
| P6.5 | Test block save/validation with Classic content | QA | 2d | Report |

**Gate G6:** Classic block inserts, edits, saves, and re-edits in the block editor; no block validation errors; Gutenberg PR merged or on track for the same release.

### 8.10 Phase 7 — Feature-plugin beta and ecosystem (10 weeks, 8 person-weeks)

| ID | Task | Owner | Effort | Output |
|---|---|---|---|---|
| P7.1 | Publish alpha, then beta, on WordPress.org | Lead | 2d | Releases |
| P7.2 | Test the top 100 editor plugins | QA + community | 15d | Compatibility matrix |
| P7.3 | Triage compatibility reports weekly | JS engineer | 10d | Fixes |
| P7.4 | Publish migration guide and examples | Docs | 5d | Docs |
| P7.5 | Office hours / support forum | Docs | 4d | Community |
| P7.6 | Instrument opt-in installs (with consent) | JS engineer | 2d | Usage data |
| P7.7 | Decide `compat4x` scope from real data | Lead | 2d | Decision record |
| P7.8 | Freeze the compatibility API for core | Lead | 1d | API doc |

**Gate G7 (core integration go/no-go):** G1–G6 green; ≥20 popular plugins pass; compatibility coverage ≥95% by install base; no unresolved P1; rollback verified; #47218 reopened (or a successor ticket accepted) by core maintainers; core integration plan approved. Without maintainer agreement, stop here and continue as a plugin.

### 8.11 Phase 8 — Core integration (10 weeks, 10 person-weeks)

> **Conditional.** Phases 8–10 start only if core maintainers reopen #47218 or accept a successor ticket after Gate G7. Otherwise the plugin remains the product.

| ID | Task | Owner | Effort | Output |
|---|---|---|---|---|
| P8.1 | Import v8 vendor tree into `src/js/_enqueues/vendor/tinymce/` | JS engineer | 2d | Vendor commit |
| P8.2 | Remove v4 vendor tree and `compat3x` | JS engineer | 1d | Deletion commit |
| P8.3 | Port PHP registration and settings | PHP integrator | 8d | Core patch |
| P8.4 | Port WP plugins and JS modules | JS engineer | 8d | Core patch |
| P8.5 | Port CSS | UI engineer | 6d | Core patch |
| P8.6 | Update `Gruntfile.js` and build | Build engineer | 3d | Build green |
| P8.7 | Update PHPUnit/QUnit tests | QA | 5d | Tests green |
| P8.8 | Update `_mce_set_direction`, `update-core.php` cleanup | PHP integrator | 1d | Core patch |
| P8.9 | Write dev notes and upgrade notice | Docs | 3d | Published |
| P8.10 | Remove the feature plugin's temporary shims | JS engineer | 2d | Clean core |

**Gate G8:** `npm run build` and `npm run test` green; no v4 references in core; feature plugin and core behave identically on the E2E suite; dev notes published.

### 8.12 Phase 9 — Core beta/RC hardening (12 weeks, 12 person-weeks)

| ID | Task | Owner | Effort | Output |
|---|---|---|---|---|
| P9.1 | Beta 1, 2, 3 bug triage | Team | 15d | Triage log |
| P9.2 | Accessibility audit and fixes | A11y + UI | 8d | Audit report |
| P9.3 | Performance profiling and fixes | QA + JS | 6d | Metrics |
| P9.4 | Security review and fixes | Security | 5d | Sign-off |
| P9.5 | i18n/RTL verification | QA | 3d | Report |
| P9.6 | Hosting/plugin compatibility testing | Community | 8d | Matrix |
| P9.7 | Rollback plugin and runbook | JS engineer | 3d | Plugin |
| P9.8 | Release candidate sign-off | Lead | 2d | Checklist |

**Gate G9:** no open P1/P2; accessibility sign-off; security sign-off; performance within budget; rollback tested; release checklist complete.

### 8.13 Phase 10 — Release and deprecation (ongoing, 4 person-weeks)

| ID | Task | Owner | Timing |
|---|---|---|---|
| P10.1 | Ship the core release | Lead | Release day |
| P10.2 | Monitor support forums and compatibility reports | Team | First 8 weeks |
| P10.3 | Publish `compat4x` deprecation schedule | Docs | Release + 2 weeks |
| P10.4 | Move `compat4x` to an optional plugin | JS engineer | Release + 1 major |
| P10.5 | Remove `compat4x` from core | Core team | Release + 2 majors |
| P10.6 | Postmortem and metrics report | Lead | Release + 8 weeks |

### 8.14 Parallel workstreams

These run across phases and need named owners:

| Workstream | Activities | Cadence |
|---|---|---|
| **Documentation** | Dev notes, migration guide, examples, FAQ, changelog | Continuous |
| **Accessibility** | Checklist per phase, audits at G3/G5/G9 | Each gate |
| **Security** | Threat model, sanitizer review, iframe policy, dependency audit | P2, P5, P9 |
| **Performance** | Budget checks in CI, profiling at each phase | Each gate |
| **i18n** | Language pack mapping, RTL, string extraction | P5, P8, P9 |
| **Ecosystem** | Tracker, outreach, office hours | P7 onward |
| **Gutenberg** | Classic block, `editor.scss`, release coordination | P3, P6, P8 |

### 8.15 Calendar (four contributors)

| Month | Phases | Milestone |
|---|---|---|
| 1 | P0, P1 start | Charter, baseline, first boot |
| 2 | P1, P2 start | v8 boots; compat skeleton |
| 3 | P2 | Compat alpha; fixture suite |
| 4 | P2, P3 start | Compat beta; icon pack |
| 5 | P3 | Toolbar and dialogs |
| 6 | P3, P4 start | UI port complete |
| 7 | P4 | Plugin ports |
| 8 | P4, P5 start | No v4 API in WP code |
| 9 | P5 | CSS and content parity |
| 10 | P5, P6 | Golden files; Classic block |
| 11 | P7 | Public beta; compatibility data |
| 12 | P7, P8 start | Core integration go/no-go |
| 13 | P8 | v8 in core |
| 14 | P9 | Core beta |
| 15 | P9 | RC |
| 16 | P10 | Release |

With two contributors, double the calendar (24–30 months). With six, the critical path (compat → UI → plugins → core) still dominates; expect 11–12 months, not 6.

### 8.16 Critical dependencies and ordering constraints

1. **`compat4x` must exist before the public alpha.** Plugin authors need a target; without it the beta measures nothing but core.
2. **The icon pack must exist before the toolbar port.** v8 will not render Dashicons classes.
3. **The `wp_adv` decision must be made before the CSS rewrite.** The layout depends on it.
4. **The floating-toolbar manager must be unified before porting `wplink`/`wpeditimage`/`wpview`.** Otherwise three ports become three implementations.
5. **The Gutenberg PR must be on track before core merge.** Gutenberg releases independently; a last-minute break is a release blocker.
6. **The rollback plugin must be tested before RC.** A rollback plan that has never run is not a plan.

---

## 9. File-by-file work breakdown

Effort is in **person-days** for an experienced contributor, including self-testing but excluding review latency. "Risk" is the chance that the estimate doubles.

### 9.1 PHP core

| File | Lines | Work | Risk | Days |
|---|---:|---|---|---|
| `src/wp-includes/class-wp-editor.php` | 1945 | Theme/skin/resize defaults, plugin list, toolbar mapping, `block_formats`, `element_format`, `license_key`, `promotion`, `branding`, `base_url`, language URL, `editor_js()`, `print_default_editor_scripts()`, `wp_mce_translation()`, `force_uncompressed_tinymce()`, translations | **High** | 15 |
| `src/wp-includes/script-loader.php` | ~700 | Register v8 root/model/theme/icons/skin/content CSS; remove `compat3x`; update `wp_tinymce_inline_scripts()` Classic block settings; update `wp_default_packages_vendor` | High | 4 |
| `src/wp-includes/functions.php` | — | `_mce_set_direction()`: drop `rtl_ui`; keep `directionality` + `ltr` button | Low | 0.5 |
| `src/wp-admin/includes/update-core.php` | — | Update the legacy file cleanup list so v4 files are removed on upgrade and v8 files are not deleted | Medium | 1 |
| `src/wp-includes/kses.php` | — | Review allowed tags/attributes for iframes, `sandbox`, `allow`, `srcset`; align with v8 sanitizer | High | 2 |
| `src/wp-includes/media.php` | — | Embed/iframe sandbox policy; `wp_embed` output compatibility | Medium | 1 |
| `src/wp-includes/formatting.php` | — | Entity/URL edge cases exposed by v8's stricter parser | Medium | 1 |
| `src/wp-includes/pluggable.php`? | — | No editor code; skip | — | 0 |
| `src/wp-admin/includes/plugin.php`? | — | No editor code; skip | — | 0 |
| `src/wp-includes/default-filters.php` | — | Verify editor filters still attach in the right order | Low | 0.5 |
| **Subtotal** | | | | **25** |

**`class-wp-editor.php` checklist:**

1. `default_settings()`:
   - `theme` → `silver`
   - `skin` → `oxide` (or `oxide-dark`)
   - `resize` → `true` (replace `'vertical'`)
   - remove `rtl_ui`
   - add `license_key: 'gpl'`, `promotion: false`, `branding: false`
   - add `base_url`
   - keep `menubar: false`, `branding: false`, `relative_urls: false`, `remove_script_host: false`, `convert_urls: false`, `entity_encoding: 'raw'`, `keep_styles: false`
   - decide `element_format` (recommend `'xhtml'` initially)
   - decide `sandbox_iframes` / `convert_unsafe_embeds`
2. `editor_settings()`:
   - default `plugins` list (Section 7.5.2)
   - `toolbar1..4` mapping
   - `block_formats` → `blocks` button
   - `style_formats` if present
   - `paste` options → v8 equivalents
   - `browser_spellcheck`
   - `text_patterns: false`
   - `autoresize_*`
   - `wp_shortcut_labels`
3. `editor_js()`:
   - `ref.theme` → `silver`
   - remove `tinymce.$` and `tinymce.Env.ie` uses
   - keep `tinyMCEPreInit` shape
   - print root/model/theme/icons in order
4. `print_default_editor_scripts()`:
   - separate plugin list for the Classic block
   - `wp.editor.getDefaultSettings()` output
   - ensure `wp_adv` and media buttons are present
5. `wp_mce_translation()`:
   - `langs/en-GB.js` naming
   - `ScriptLoader.markDone`
   - fallback for underscore locales
6. `force_uncompressed_tinymce()`:
   - new file list
   - no `wp-tinymce.js`
7. `print_tinymce_scripts()`:
   - enqueue order and dependencies
8. `wp_fullscreen_html()`:
   - update `.mce-*` markup if any
9. `wp_link_dialog()`:
   - keep; verify it still targets the right editor

### 9.2 WordPress TinyMCE plugins

| File | Lines | Work | Risk | Days |
|---|---:|---|---|---|
| `plugins/wordpress/plugin.js` | 1206 | Button registry, commands, shortcuts, paste filters, `wp_more`/`wp_page`, media, DFW, help dialog, floating toolbar manager, `wp_shortcut_labels` | **Very high** | 10 |
| `plugins/wplink/plugin.js` | 615 | Replace `tinymce.ui.Factory`/`Control.extend` inline toolbar with DOM; keep `wpLink.open()`; preview/input behavior | **High** | 6 |
| `plugins/wpeditimage/plugin.js` | 900 | `editor.parser`/`Serializer` verification, caption round-trip, `wp.media`, inline toolbar, `classic_block_editor` option | High | 5 |
| `plugins/wpview/plugin.js` | 225 | `EditorManager`, `Env`, content CSS, placeholder sanitization, inline toolbar | Medium | 3 |
| `plugins/wptextpattern/plugin.js` | 348 | Event order, undo transactions, option lookup, `text_patterns: false` | Medium | 3 |
| `plugins/wpautoresize/plugin.js` | 207 | Native `autoresize`, DFW sizing, textarea sync | Medium | 2 |
| `plugins/wpemoji/plugin.js` | 134 | Sanitizer allowlist, filters | Low | 1 |
| `plugins/wpgallery/plugin.js` | 112 | Selection/DOM updates, `wp.media` | Low | 1 |
| `plugins/wpdialogs/plugin.js` | 92 | Opt-in translator or removal | Medium | 2 |
| `plugins/compat4x/plugin.js` | new | Full compatibility layer (Section 7.4) | **Very high** | 20 |
| `plugins/wordpress/icons.js` | new | SVG icon pack | Medium | 3 |
| `plugins/wordpress/ui.js` | new | Shared button/menu registration | High | 4 |
| **Subtotal** | | | | **60** |

**Per-plugin acceptance criteria:**

- `wordpress`: every command, shortcut, and button works; paste filters fire; help dialog opens; no `tinymce.ui.*`; no `editor.settings`.
- `wplink`: inline toolbar appears on link selection, positions correctly, opens `wpLink`, updates the link, removes it; keyboard accessible.
- `wpeditimage`: insert, edit, align, resize, caption, replace, remove; caption shortcode round-trips; no parser regression.
- `wpview`: embeds render as views, edit/remove works, content survives save/reload.
- `wptextpattern`: all patterns, undo/redo, IME, no double-firing.
- `wpautoresize`: grows/shrinks, min/max height, DFW, mobile.
- `wpemoji`: emoji renders and survives save.
- `wpgallery`: gallery placeholder, edit, shortcode round-trip.
- `wpdialogs`: either removed cleanly or opt-in works.

### 9.3 WordPress editor JS modules

| File | Lines | Work | Risk | Days |
|---|---:|---|---|---|
| `src/js/_enqueues/wp/editor/base.js` | 1508 | `switchEditors`, `wp.editor.initialize/remove/getContent`, remove `tinymce.$`/`Env.iOS`, replace `theme.resizeTo`, update `.mce-*` selectors, handle async init | **High** | 6 |
| `src/js/_enqueues/wp/editor/dfw.js` | 1636 | `tinymce.util.VK` (keep), `FloatPanel.hideAll()` (remove/replace), `.mce-*` selectors, `theme.resizeTo`, focus handling | **High** | 6 |
| `src/js/_enqueues/wp/mce-view.js` | 1000 | `tinymce.editors` → `EditorManager.get()`, `Env.ie` removal, `tinymce.html.*` (keep), content CSS path | Medium | 4 |
| `src/js/_enqueues/wp/media/editor.js` | — | Verify `wp.media.editor.open()` and `send` integration | Low | 1 |
| `src/js/_enqueues/wp/widgets/text.js` | — | Verify widget editor init/remove | Low | 1 |
| `src/js/_enqueues/wp/customize/controls.js` | — | Remove `tinymce.ui.FloatPanel.zIndex`; verify widget editor | Medium | 2 |
| `src/js/_enqueues/wp/admin/post.js` | — | `.mce-toolbar-grp` selector; verify sticky header | Low | 1 |
| `src/js/_enqueues/wp/editor/noscript.js`? | — | Verify no v4 dependency | Low | 0.5 |
| **Subtotal** | | | | **21.5** |

**`base.js` specifics:**

- `wp.editor.initialize()` currently waits for `tinymce.init` and reads `editor.iframeElement`, `editor.getBody()`, `editor.getContent()`. v8 keeps these, but the theme is async. Add an `init` promise and a timeout with a user-facing error.
- `switchEditors` toggles `.html-active`/`.tmce-active` and calls `editor.setContent()`. Keep, but stop assuming `.mce-tinymce` exists before init.
- `editor.theme.resizeTo()` is gone. Replace with a `setEditorHeight(editor, height)` helper that sets `iframeElement.style.height` and the container min-height, then dispatches a resize so v8 recalculates.
- `tinymce.$` is gone. Replace with `editor.dom` or native DOM. The remaining uses are small.
- `Env.iOS` is gone. Use `Env.os.isiOS()`.
- Remove the `mce_SELRES_*` resize handles and rely on v8's status bar resize; if vertical-only resize is required, implement a WP handle that calls `setEditorHeight`.

**`dfw.js` specifics:**

- `tinymce.util.VK` still exists; keep.
- `tinymce.ui.FloatPanel.hideAll()` is gone. Replace with `editor.dispatch('wp-hide-floating-ui')` or call the unified toolbar manager's `hideAll()`.
- `.mce-floatpanel`, `.mce-toolbar-grp`, `.mce-edit-area`, `.mce-statusbar`, `.mce-menubar` selectors → `.tox-pop`, `.tox-editor-header`, `.tox-edit-area`, `.tox-statusbar`, and the WP toolbar manager.
- `mceEditor.theme.resizeTo()` → the height helper.
- DFW's focus/blur and `wp-fullscreen` body classes must be tested with v8's focus management.

**`mce-view.js` specifics:**

- `tinymce.editors` → `tinymce.EditorManager.get()`; guard for `undefined`.
- `tinymce.Env.ie` → remove; IE is not supported.
- `tinymce.html.DomParser`, `Serializer`, `Schema` still exist; keep.
- `skins/lightgray/content.min.css` → the v8 content CSS URL.
- The `wpview` placeholder markup and `data-wpview-*` attributes are a public contract; do not rename them.

### 9.4 CSS

| File | Lines | `.mce-*` matches | Work | Risk | Days |
|---|---:|---:|---|---|---|
| `src/wp-includes/css/editor.css` | 1873 | 298 | Rewrite chrome for `.tox-*`; keep content classes; RTL; responsive; dialogs; menus; tooltips | **High** | 8 |
| `src/wp-admin/css/edit.css` | 2146 | 10 | Editor wrap, DFW, mobile | Medium | 2 |
| `src/wp-admin/css/customize-widgets.css` | 592 | 2 | Widget editor | Low | 0.5 |
| `src/wp-includes/css/dashicons.css` | — | — | Remove editor-only icon rules if unused; do not remove Dashicons | Low | 0.5 |
| `src/wp-content/themes/twenty*` editor styles | — | few | `.mce-item-table`, `.mce-content-body`; keep content classes stable | Low | 1 |
| Gutenberg `packages/block-library/src/freeform/editor.scss` | — | 3 | `.mce-edit-area`, `.mce-tinymce`, `.mce-container-body` | Medium | 2 |
| **Subtotal** | | | | | **14** |

**`editor.css` rewrite map:**

| v4 selector | v8 selector | Notes |
|---|---|---|
| `.mce-tinymce` | `.tox-tinymce` | Container, border, radius. |
| `.mce-toolbar-grp` | `.tox-editor-header` | Background, padding, sticky behavior. |
| `.mce-toolbar` | `.tox-toolbar-overlord` / `.tox-toolbar__primary` | Row layout. |
| `.mce-btn` | `.tox-tbtn` | Height, padding, hover, active, disabled. |
| `.mce-btn-group` | `.tox-toolbar__group` | Separators. |
| `.mce-edit-area` | `.tox-edit-area` | Iframe background, borders. |
| `.mce-statusbar` | `.tox-statusbar` | Height, path, resize handle. |
| `.mce-menu` | `.tox-menu` / `.tox-collection` | Dropdowns. |
| `.mce-floatpanel` | `.tox-pop` | Inline toolbars. |
| `.mce-tooltip` | `.tox-tooltip` | Tooltips. |
| `.mce-window` | `.tox-dialog` | Dialogs. |
| `.mce-i-*` | SVG | Delete Dashicons-specific editor icons. |
| `.mce-rtl` | `[dir=rtl]` | RTL. |

**Do not** add `.mce-*` aliases to core CSS. Aliases belong in `compat4x.css` and are removed before the core merge.

### 9.5 Build and tooling

| File | Work | Risk | Days |
|---|---|---|---|
| `Gruntfile.js` | Update `copy:vendor-js`, remove `concat:tinymce`, update `uglify:core`, add license/size checks | Medium | 3 |
| `package.json` | Add size-limit or a custom check; no new runtime dependency | Low | 0.5 |
| `.github/workflows/*` | Add compat fixture job, E2E job, visual regression job | Medium | 2 |
| `webpack.config.js` | Verify WP plugin bundles still build; no change expected | Low | 0.5 |
| `tests/qunit/index.html`? | Register new test modules | Low | 0.5 |
| **Subtotal** | | | **6.5** |

**Grunt details:**

- `copy:vendor-js` must copy `tinymce.min.js` for both `src` and `build`. The current special case (exclude then copy) exists because v4's `tinymce.js` was used uncompressed in `src`; v8's entry is `tinymce.min.js`. Verify `SCRIPT_DEBUG` behavior: if WordPress wants an uncompressed build, v8 ships `tinymce.js` too. Decide whether to copy both.
- Remove `concat:tinymce` and its `build:js` invocation. If a legacy `wp-tinymce.js` is still requested by a plugin, serve a deprecation stub, not a v4 bundle.
- Add `copy:tinymce-license` for `license.md` and `notices.txt`.
- Add a `check:tinymce-size` task that gzips the default editor set and compares to the budget.

### 9.6 Tests

| File / suite | Work | Risk | Days |
|---|---|---|---|
| `tests/phpunit/tests/editor/wpTinyMceInlineScripts.php` | Update expected plugin list, toolbar names, `tinyMCEPreInit` shape | Medium | 2 |
| `tests/phpunit/tests/functions/mceSetDirection.php` | Remove `rtl_ui` expectation; assert `directionality` | Low | 0.5 |
| `tests/phpunit/tests/dependencies/scripts.php` | Replace `compat3x` with `compat4x`; assert new handles/dependencies | Medium | 2 |
| New PHPUnit: settings, translation, script order | Cover `default_settings`, `editor_settings`, `wp_mce_translation`, `force_uncompressed_tinymce` | Medium | 3 |
| `tests/qunit/wp-includes/js/tinymce/tinymce-obsolete.js` | Rewrite for v8 removals; keep as a regression guard | Medium | 2 |
| `tests/qunit/wp-includes/js/tinymce/plugins/wptextpattern/plugin.js` | Add v8 behavior, undo, IME | Medium | 3 |
| New QUnit: `compat4x` fixtures | 30 fixtures | High | 5 |
| New Playwright: editor smoke, toolbar, dialogs, DFW, widgets, Classic block | **High** | 8 |
| New Playwright: content round-trip | High | 5 |
| Visual regression baselines | Medium | 4 |
| Accessibility automation (axe) | Medium | 3 |
| **Subtotal** | | | **37.5** |

### 9.7 Gutenberg

| File | Work | Risk | Days |
|---|---|---|---|
| `packages/block-library/src/freeform/edit.js` | Verify `wp.oldEditor` init/remove, focus, content sync | Medium | 2 |
| `packages/block-library/src/freeform/editor.scss` | `.mce-*` → `.tox-*` or legacy classes | Medium | 2 |
| `packages/block-library/src/freeform/test/*` | E2E for Classic block | Medium | 3 |
| `packages/edit-post` / `editor` styles | Verify editor chrome does not leak | Low | 1 |
| **Subtotal** | | | **8** |

### 9.8 Documentation

| Document | Work | Days |
|---|---|---|
| Core dev note (`make.wordpress.org/core`) | 3 |
| Plugin migration guide (v4 → v8, with `compat4x` examples) | 4 |
| Theme/plugin compatibility FAQ | 2 |
| Hosting/rollback runbook | 1 |
| Accessibility statement | 1 |
| **Subtotal** | **11** |

### 9.9 Total

| Area | Person-days | Person-weeks |
|---|---:|---:|
| PHP core | 25 | 5 |
| WP TinyMCE plugins | 60 | 12 |
| WP editor JS modules | 21.5 | 4.3 |
| CSS | 14 | 2.8 |
| Build/tooling | 6.5 | 1.3 |
| Tests | 37.5 | 7.5 |
| Gutenberg | 8 | 1.6 |
| Documentation | 11 | 2.2 |
| **Sum** | **183.5** | **36.7** |

The phase estimate (91 person-weeks) is roughly 2.5× the raw file estimate. The difference is review, coordination, bug fixing, ecosystem support, release management, and contingency. That ratio is normal for a change of this size; do not plan from the file table alone.

---

## 10. Test strategy

### 10.1 What "tested" means here

The migration has four independent quality dimensions, and a single green suite is not enough:

1. **Functional:** the editor does what it did before.
2. **Content:** saved content is unchanged, or every change is deliberate.
3. **Visual:** the editor looks right in every supported context.
4. **Compatibility:** third-party plugins load and behave.

Each has its own gates. A release cannot trade one for another ("the content is stable but the toolbar is invisible" is not a pass).

### 10.2 Environments and browser matrix

| Environment | Why it matters | Coverage |
|---|---|---|
| WordPress admin, Classic editor | Primary use case | Full E2E |
| WordPress admin, Classic block | Gutenberg integration | Full E2E |
| Front-end `wp_editor()` | Themes and plugins | Smoke + content |
| Widgets (classic and block) | Customizer and block widgets | Smoke |
| Customizer | `wp.editor` in controls | Smoke |
| Network admin | Multisite | Smoke |
| Press This / quick edit | Secondary editors | Smoke |
| Mobile admin | Responsive and touch | E2E subset |

| Browser | Versions | Priority |
|---|---|---|
| Chrome | Current, current-1 | P1 |
| Firefox | Current, ESR | P1 |
| Safari | Current, current-1 | P1 |
| Edge | Current | P2 |
| iOS Safari | Current, current-1 | P1 |
| Android Chrome | Current | P2 |

WordPress no longer supports IE. Do not spend time on IE emulation; ensure `Env.ie` shims do not accidentally enable IE branches.

### 10.3 Content corpus

Build a fixture corpus of **80 posts** (or more), stored as JSON or HTML with expected output. Categories:

| Category | Count | What it catches |
|---|---:|---|
| Plain paragraphs | 5 | `wpautop`, `<br>`, entity handling |
| Headings/lists/quotes | 10 | Block formats, list nesting, text patterns |
| Links (internal, external, anchor, mailto, tel) | 8 | URL handling, `wplink` |
| Images and captions | 10 | `wpeditimage`, caption shortcodes, alignment, `srcset` |
| Galleries | 5 | `wpgallery`, shortcode attributes |
| Embeds and views | 10 | `wpview`, iframes, sandbox policy |
| Shortcodes (custom, nested, self-closing) | 8 | Serialization, escaping |
| Tables | 5 | `table` plugin, `mce-item-table` |
| Code and preformatted | 5 | Whitespace, entities |
| RTL content | 5 | Directionality, punctuation |
| Emoji | 5 | Twemoji, sanitizer |
| Pasted Word/Google Docs | 4 | Paste cleanup |
| Raw HTML / comments | 5 | `<!--more-->`, `<!--nextpage-->`, conditional comments |
| **Total** | **85** | |

**Golden-file rules:**

- Save through `wp_editor` (or the REST API) with the same user and settings.
- Compare the raw post content, not the rendered front end.
- Normalize only known, approved differences (e.g. attribute order) with an explicit normalizer, never by deleting whitespace globally.
- Every allowed diff needs a code comment and a reviewer sign-off.
- Run the corpus on both v4 and v8 and diff the outputs. The v4 output is the reference until a diff is approved.

### 10.4 PHPUnit

| Suite | What it covers | New/updated |
|---|---|---|
| `tests/phpunit/tests/editor/wpTinyMceInlineScripts.php` | `wp_tinymce_inline_scripts()` output, plugin list, toolbar arrays | Updated |
| `tests/phpunit/tests/functions/mceSetDirection.php` | `_mce_set_direction()` | Updated |
| `tests/phpunit/tests/dependencies/scripts.php` | Registered handles, dependencies, `compat4x` | Updated |
| New `tests/phpunit/tests/editor/wpEditorSettings.php` | `default_settings()`, `editor_settings()`, filters | New |
| New `tests/phpunit/tests/editor/wpEditorScripts.php` | `editor_js()`, `print_default_editor_scripts()`, `force_uncompressed_tinymce()` | New |
| New `tests/phpunit/tests/editor/wpMceTranslation.php` | Locale mapping, language URL, `markDone` | New |
| New `tests/phpunit/tests/editor/wpEditorCompat.php` | `compat4x` PHP filters, deprecation notices | New |

Run with:

```bash
npm run test:php
npm run test:php -- --filter WP_Editor
```

PHPUnit must not require a browser. It asserts the settings and script contracts; behavior belongs in QUnit/E2E.

### 10.5 QUnit

| Suite | What it covers |
|---|---|
| `tests/qunit/wp-includes/js/tinymce/tinymce-obsolete.js` | v8 removals; asserts removed APIs are absent or shimmed |
| `tests/qunit/wp-includes/js/tinymce/plugins/wptextpattern/plugin.js` | Patterns, undo, IME, event order |
| New `tests/qunit/wp-includes/js/tinymce/plugins/compat4x/plugin.js` | Each shim: buttons, menus, settings, Env, utils, dialogs |
| New `tests/qunit/wp-includes/js/tinymce/plugins/wordpress/ui.js` | Button registry, icon names, toggle state |
| New `tests/qunit/wp-includes/js/tinymce/plugins/wplink/plugin.js` | Inline toolbar show/hide/position |
| New `tests/qunit/wp-includes/js/tinymce/plugins/wpeditimage/plugin.js` | Caption parsing/serialization |

QUnit runs in the browser against a real TinyMCE instance. Use a headless Chrome runner in CI, and keep a manual page for debugging.

### 10.6 Playwright E2E

New specs under `tests/e2e/specs/editor/`:

| Spec | Scenarios |
|---|---|
| `classic-editor.test.js` | Load, type, save, reload, visual/HTML switch, DFW |
| `toolbar.test.js` | Every default button, `wp_adv`, overflow, keyboard |
| `dialogs.test.js` | Help dialog, link modal, media modal, focus return |
| `content.test.js` | Corpus round-trip, shortcodes, embeds, captions |
| `classic-block.test.js` | Insert Classic block, edit, save, re-edit |
| `widgets.test.js` | Classic widget, block widget, customizer |
| `front-end.test.js` | `wp_editor()` in a theme |
| `paste.test.js` | Paste fixtures via clipboard API |
| `mobile.test.js` | Touch, viewport, toolbar drawer |

Use the existing WordPress E2E utilities for login, editor initialization, and cleanup. Do not add a second test harness.

### 10.7 Visual regression

- Capture the editor at 320, 768, 1024, and 1440 px.
- Capture LTR and RTL.
- Capture default, DFW, focus, and disabled states.
- Capture each dialog and menu.
- Store baselines in `tests/visual-regression/snapshots/`.
- Review every diff; do not auto-accept.
- Run on Chromium only for speed; use Firefox/Safari for manual spot checks.

The v8 skin changes spacing and typography. Expect a large first baseline diff. Freeze the v4 baseline **before** the migration so the first v8 run has a reference.

### 10.8 Accessibility

Checklist based on WCAG 2.2 AA:

- Keyboard reachability for every toolbar button, menu, dialog, and inline toolbar.
- Visible focus indicator on all controls.
- Focus trap in dialogs, focus return to the trigger.
- Escape closes menus/dialogs without losing content.
- ARIA roles/labels for toolbar groups, toggle buttons, menus, dialogs.
- Screen-reader announcements for mode switches (visual/HTML, DFW).
- Color contrast for toolbar, status bar, placeholders, and disabled states.
- Touch target size (24×24 minimum, 44×44 preferred).
- Reduced motion support.
- RTL keyboard behavior.

Tools: axe-core in Playwright, manual NVDA (Windows) and VoiceOver (macOS/iOS) passes, keyboard-only run.

### 10.9 Performance

Measure on a fixed environment:

- Cold and warm cache.
- Admin post editor with the default toolbar.
- Classic block in the block editor.
- Front-end `wp_editor()`.
- 1 editor, 4 editors (widgets), 10 editors (stress).

Metrics:

- transferred bytes (gzip/brotli);
- JS parse/compile time;
- editor `init` time;
- time to first keystroke;
- memory after 10 minutes;
- number of requests.

Budgets are in Section 13. Add a CI check that fails when the default set exceeds the budget.

### 10.10 Security

| Test | What it verifies |
|---|---|
| Paste XSS corpus | Scripts, event handlers, `javascript:` URLs, SVG, MathML are removed |
| Iframe sandbox | Embed providers still work; unknown iframes are sandboxed |
| URL schemes | `javascript:`, `data:`, `vbscript:` rejected; `mailto:`/`tel:` allowed |
| Shortcode escaping | Attributes cannot break out of the shortcode |
| Capability checks | `wp_editor` respects `unfiltered_html` |
| Nonce/csrf | Media/link dialogs still use nonces |
| License key | Editor boots with `'gpl'`; missing/empty key is replaced with `'gpl'`; `api_key` + `'gpl'` from a filter is dropped with a notice; a non-GPL key is left alone; no key leakage in HTML |
| Dependency audit | v8 and DOMPurify versions have no known critical CVEs |

### 10.11 Compatibility

Three tiers:

| Tier | Definition | Required result |
|---|---|---|
| **A** | Top 20 editor plugins by active installs | Must work without changes, or with a documented one-line fix |
| **B** | Next 80 popular plugins | Must load; degraded behavior documented |
| **C** | Long tail / abandoned | Best effort; `compat4x` logs and degrades |

Test method:

1. Install the plugin on a clean site with the feature plugin.
2. Run a scripted scenario per plugin (insert button, open dialog, save).
3. Record console errors, PHP notices, and visual diffs.
4. File issues with the plugin author and link them in the tracker.
5. Re-test at each beta.

Do not publish a "compatible" badge without a test date and version.

### 10.12 Manual and exploratory

Automation will not catch everything. Schedule:

- Weekly 30-minute exploratory session per contributor.
- A "bug scrub" of the compatibility tracker.
- A "content chef" session: paste from five real documents, edit, save, reload.
- A "keyboard only" session.
- A "slow connection" session (throttled 3G).
- A "screen reader" session.

### 10.13 CI gates

| Gate | Jobs | Blocking |
|---|---|---|
| G0 | Lint, PHPUnit, QUnit smoke | Yes |
| G2 | Compat fixtures, 30 plugins | Yes |
| G3 | E2E toolbar/dialogs, a11y smoke | Yes |
| G4 | Plugin QUnit, code search for v4 APIs | Yes |
| G5 | Golden files, visual regression | Yes |
| G6 | Classic block E2E | Yes |
| G7 | Compatibility matrix (nightly) | No (report) |
| G8 | Full PHPUnit/QUnit/E2E, build, size | Yes |
| G9 | Full matrix, a11y, security, performance | Yes |

### 10.14 Test data management

- Fixtures live in the repo, not in a developer's database.
- Use deterministic user IDs, post IDs, and site URLs.
- Reset the database between E2E runs.
- Never depend on external embeds in CI; mock the oEmbed responses.
- Store screenshots as artifacts, not in git, except the approved baselines.
- Keep a `tests/fixtures/README.md` explaining how to add a fixture.

---

## 11. Rollout, ecosystem, and deprecation

### 11.1 Release stages

| Stage | Audience | Duration | Exit criteria |
|---|---|---|---|
| **Internal alpha** | Core team + invited plugin authors | 4 weeks | Editor boots, no P1 |
| **Public alpha** | Plugin authors, hosts | 6 weeks | `compat4x` covers top APIs; docs published |
| **Public beta** | Anyone on a test site | 8 weeks | ≥20 plugins pass; no P1; content stable |
| **Core beta 1–3** | WordPress beta testers | 8–12 weeks | No P1/P2; a11y/security sign-off |
| **RC** | Release candidate testers | 2–4 weeks | Release checklist complete |
| **Release** | Everyone | — | Shipped |
| **Post-release** | Support forums | 8 weeks | Regression rate normal |

### 11.2 Communication plan

| Channel | Content | Cadence |
|---|---|---|
| Make/Core blog | Dev notes, call for testing, decisions | At each milestone |
| Make/Plugins blog | Migration guide, `compat4x` usage | Alpha, beta, release |
| Make/Themes blog | Editor styles, `.mce-*` changes | Beta |
| Support forums | Known issues, workarounds | Weekly |
| Slack (`#core-editor`, `#core-js`, `#hosting`) | Office hours, triage | Weekly |
| GitHub/Trac | Tracking issues, compatibility reports | Continuous |
| WordPress.org plugin page | Feature plugin changelog, FAQ | Each release |

**Dev note outline:**

1. Why the upgrade, and why now.
2. What changed for users.
3. What changed for plugin authors (API table).
4. What `compat4x` covers and what it does not.
5. How to test.
6. How to report issues.
7. Deprecation timeline.

### 11.3 Compatibility tiers and support policy

| Tier | Support | Response |
|---|---|---|
| A | Official testing, fixes in core or `compat4x` | 5 business days |
| B | Best-effort testing, documented workarounds | 10 business days |
| C | `compat4x` graceful degradation only | No SLA |

Publish the tier list with plugin names and versions. Update it at each beta.

### 11.4 Deprecation schedule

| Item | Deprecated | Removed | Replacement |
|---|---|---|---|
| `compat3x` | Already deprecated | Core migration release | `compat4x` |
| TinyMCE 4 vendor tree | Core migration release | Same release | TinyMCE 8 |
| `wpdialogs` default | Feature plugin beta | Core migration + 1 major | v8 native dialogs |
| `compat4x` in core | Core migration + 1 major | Core migration + 2 majors | Native v8 APIs |
| `editor.settings` shim | Core migration | With `compat4x` | `editor.options.get()` |
| `tinymce.$` shim | Core migration | With `compat4x` | `editor.dom` / native DOM |
| `tinymce.ui.*` shim | Core migration | With `compat4x` | `editor.ui.registry` |
| `wp-tinymce.js` bundle | WordPress 7.2 (already unregistered) | Core migration + 1 major | Separate handles |
| `wp-tinymce.php` loader | Core migration | Core migration + 1 major | Direct script URLs |

**Rule:** do not remove a shim in the same release that introduces it. Give plugin authors at least one major cycle.

### 11.5 Rollback plan

A rollback must be possible without restoring a database backup.

**Rollback plugin (`wordpress-tinymce-4`):**

- Bundles v4.9.11 (or loads it from a pinned CDN/mirror if licensing allows).
- Re-registers the v4 handles and `compat3x`.
- Restores the v4 default settings via filters.
- Disables the v8 feature plugin.
- Does not migrate content; content written by v8 must remain readable by v4. This is why `element_format: 'xhtml'` and conservative serialization matter.

**Rollback triggers:**

- A P1 data-loss or content-corruption bug.
- A security issue in v8 with no fix.
- A blocking regression for a large hosting provider.
- A Gutenberg release that breaks the Classic block.

**Rollback drill:** run the rollback plugin on a staging site with the corpus, verify content round-trip, measure the time to recover, and document it. Do this before RC, not after release.

### 11.6 Hosting and agency communication

Hosts need:

- A clear statement of which WordPress versions include v8.
- A way to opt out during the transition (the rollback plugin).
- Known issues with object caching, CSP, and iframe sandboxing.
- A contact for escalation.

Agencies need:

- A checklist for testing client sites.
- A list of plugins known to break.
- Guidance for custom TinyMCE plugins.
- A timeline for `compat4x` removal.

### 11.7 Metrics

Track:

- Feature plugin active installs (opt-in).
- Compatibility reports per week.
- P1/P2 count.
- Time to first response.
- Editor init time p50/p95.
- Payload size.
- Support forum threads tagged `tinymce-8`.
- Rollback plugin activations.

Publish a summary at beta and release. Metrics are how the project knows whether the rollout is healthy, not just whether the tests pass.

### 11.8 Ecosystem migration examples

Publish copy-paste examples for the most common patterns:

**Old:**

```js
editor.addButton('my_button', {
    text: 'My Button',
    icon: 'my-icon',
    onclick: function() {
        editor.insertContent('Hello');
    }
});
```

**New:**

```js
editor.ui.registry.addButton('my_button', {
    text: 'My Button',
    icon: 'my-icon',
    onAction: function() {
        editor.insertContent('Hello');
    }
});
```

**Old:**

```js
editor.windowManager.open({
    title: 'My Dialog',
    body: [
        { type: 'textbox', name: 'title', label: 'Title' }
    ],
    onSubmit: function(e) {
        console.log(e.data.title);
    }
});
```

**New:**

```js
editor.windowManager.open({
    title: 'My Dialog',
    body: {
        type: 'panel',
        items: [
            { type: 'input', name: 'title', label: 'Title' }
        ]
    },
    buttons: [
        { type: 'cancel', text: 'Cancel' },
        { type: 'submit', text: 'Save', primary: true }
    ],
    onSubmit: function(api) {
        console.log(api.getData().title);
    }
});
```

**Old:**

```js
if (tinymce.Env.ie && tinymce.Env.ie < 11) { ... }
```

**New:**

```js
if (tinymce.Env.browser.isIE()) { ... } // or delete the branch
```

**Old:**

```js
var settings = editor.settings;
```

**New:**

```js
var value = editor.options.get('my_option');
```

**Old:**

```js
tinymce.editors.forEach(function(editor) { ... });
```

**New:**

```js
tinymce.EditorManager.get().forEach(function(editor) { ... });
```

---

## 12. Security

### 12.1 Threat model

TinyMCE sits on the boundary between untrusted content and the admin DOM. The migration changes that boundary in both directions: v8 sanitizes more aggressively in some places and introduces new embed/iframe defaults in others.

| Threat | Vector | Impact | Mitigation |
|---|---|---|---|
| Stored XSS | Post content saved through the editor | Admin compromise | v8 sanitizer + `wp_kses` + capability checks |
| DOM XSS | Pasted HTML, shortcode attributes, URLs | Admin compromise | Sanitize on paste, validate URLs, escape output |
| Iframe injection | Embeds, `<iframe>` in content | Clickjacking, data exfiltration | `sandbox_iframes`, allowlist providers |
| Open redirect | `javascript:`/`data:` URLs in links | Phishing | URL scheme allowlist |
| Dialog phishing | Third-party dialog content | Credential theft | No arbitrary remote URLs in dialogs; nonce-protected WP modals |
| Supply chain | Vendor bundle compromise | Full site compromise | Pin versions, verify hashes, review diffs |
| License leakage | Key in HTML | Billing/abuse | GPL key only; never expose commercial keys |
| CSP bypass | Inline scripts/styles added by plugins | XSS | Avoid inline event handlers; CSP-friendly output |

### 12.2 Sanitizer and schema

v8 uses DOMPurify 3.3.2 and a stricter schema. WordPress uses `wp_kses` for stored content. The two must agree on what is allowed.

Tasks:

1. Diff the v4 and v8 allowed-element behavior for the corpus.
2. Decide the canonical allowlist: `wp_kses` remains the storage boundary; v8 is the editing boundary. Do not let v8's schema silently widen what `wp_kses` allows.
3. Add `extended_valid_elements` only for specific WordPress needs (emoji images, `wpview` placeholders, caption attributes), with tests.
4. Verify `SAFE_FOR_XML` behavior for comments, CDATA, and shortcodes. WordPress stores HTML comments (`<!--more-->`); ensure they survive.
5. Fuzz the editor with malformed HTML, nested shortcodes, and Unicode edge cases.

### 12.3 Iframes and embeds

v8 defaults:

- `sandbox_iframes: true`
- `convert_unsafe_embeds: true`

These defaults are security-positive but can break WordPress embeds. Decide explicitly:

| Option | Behavior | Trade-off |
|---|---|---|
| Keep defaults | Unknown iframes sandboxed; object/embed converted | Safest; some embeds break |
| Keep sandbox, allowlist providers | Add `sandbox` exceptions for YouTube, Vimeo, Spotify, etc. | Balanced; maintenance list |
| Disable sandbox | `sandbox_iframes: false` | Maximum compatibility; weaker security |
| Disable per editor | Filter for trusted editors | Complexity |

**Recommendation:** keep `sandbox_iframes: true`, add a provider allowlist for the oEmbed providers WordPress supports, and set `convert_unsafe_embeds: false` only if the corpus shows legitimate `<object>`/`<embed>` content. Document the decision in the dev note and add tests for each provider.

WordPress's `wp_embed` and `wpview` must be tested together: the editor may sandbox an iframe that the front end later renders unsandboxed, producing a visual mismatch. Align the policies.

### 12.4 Paste

Paste is the largest content-injection surface.

- v8 sanitizes pasted HTML before insertion. Do not bypass it with `paste_preprocess` unless the content is re-sanitized.
- WordPress's `PastePreProcess` filters must not introduce unsanitized HTML.
- Test pasting from Word, Google Docs, LibreOffice, Apple Pages, VS Code, and a malicious fixture.
- Test paste into captions, tables, lists, and code blocks.
- Test `paste_as_text` and the plain-text toggle.
- Do not trust `event.content` from third-party plugins.

### 12.5 URLs

Verify v8's URL handling against WordPress's settings:

- `convert_urls: false`
- `relative_urls: false`
- `remove_script_host: false`
- `document_base_url` set correctly
- `mailto:`, `tel:`, `sms:`, `ftp:` allowed
- `javascript:`, `vbscript:`, `data:text/html` rejected
- Protocol-relative `//example.com` handled
- Fragment-only `#anchor` handled
- URLs with Unicode, spaces, and parentheses handled

Add a URL test corpus and run it through the link dialog and direct paste.

### 12.6 License key and supply chain

- Use `license_key: 'gpl'` for self-hosted WordPress. Without it, v8 disables editing.
- Never ship a commercial key in core or a plugin.
- If a plugin sets a commercial key, neither PHP nor `compat4x` may overwrite it; log a warning in `SCRIPT_DEBUG`.
- If a plugin sets `api_key` while the key is `'gpl'`, remove `api_key` and report it with `_doing_it_wrong()`; otherwise v8 switches to online validation and disables the editor (Section 7.12).
- Pin the vendor version and record the hash in the build.
- Review the vendor diff at every bump, especially `tinymce.min.js`, the silver theme, and DOMPurify.
- Keep `license.md` and `notices.txt` in the build.
- Run `npm audit`/dependency review on the build toolchain, not on the vendored browser bundle (which has no npm dependency graph at runtime).

### 12.7 Dialogs, nonces, and capabilities

- WordPress's link and media modals already use nonces and capability checks. Keep them.
- v8 native dialogs must not load arbitrary remote URLs. If a third-party plugin uses `{ type: 'iframe', url }`, validate the URL and require `unfiltered_html` or a capability check.
- The help dialog and other WP dialogs must escape all HTML.
- Do not put secrets, API keys, or user data in dialog HTML.
- Test `unfiltered_html` vs. filtered users: the editor must not let a filtered user insert markup that `wp_kses` will strip on save without warning.

### 12.8 CSP and inline code

WordPress admin does not ship a strict CSP by default, but hosts and plugins may add one.

- Avoid inline event handlers in WP-owned editor code.
- Avoid `eval` and `new Function`.
- v8 may inject inline styles; a strict `style-src` policy needs nonces or hashes. Document this for hosts.
- Test with a basic CSP (`script-src 'self'`) to identify violations.

### 12.9 Security review checklist

| Item | Owner | Evidence |
|---|---|---|
| Sanitizer diff reviewed | Security | Report |
| Iframe policy decided and tested | Security + JS | Tests |
| Paste XSS corpus passes | QA | CI |
| URL scheme corpus passes | QA | CI |
| License key behavior verified | JS | Test |
| Vendor files/hashes recorded | Build | Manifest |
| No new inline handlers/eval | JS | Code search |
| Dialog URLs validated | Security | Review |
| Capability/nonce checks intact | Security | Review |
| Dependency advisories reviewed | Security | Report |

---

## 13. Performance

### 13.1 Baseline

Measured during research on the default editor set (minified, gzipped, no compression proxy):

| Asset set | Approx. gzip |
|---|---:|
| TinyMCE 4.9.11 core + modern theme + lightgray skin + WP plugins | ~222 KB |
| TinyMCE 8.10 core + silver theme + oxide skin + icons + DOM model + four stock plugins | ~406 KB |

That is roughly **2.4×** the transferred bytes before WordPress's own plugins and CSS. The increase is expected: v8 ships a modern UI framework, SVG icons, and a stricter sanitizer. It is not automatically unacceptable, but it must be measured, budgeted, and, where possible, reduced.

### 13.2 Budgets

| Metric | v4 baseline | v8 budget | Stretch |
|---|---:|---:|---:|
| Default editor JS (gzip) | ~170 KB | ≤ 300 KB | ≤ 260 KB |
| Default editor CSS (gzip) | ~25 KB | ≤ 60 KB | ≤ 45 KB |
| Total default set (gzip) | ~222 KB | ≤ 380 KB | ≤ 330 KB |
| Editor init (p50, desktop) | baseline | +150 ms | +75 ms |
| Editor init (p95, mobile) | baseline | +400 ms | +250 ms |
| Requests | baseline | +4 | +2 |
| Memory after 10 min | baseline | +30% | +15% |

The budget is a ceiling, not a target. If the default set exceeds it, reduce the default plugin list before merging.

### 13.3 Loading strategy

1. **Ship only what the default editor uses.** Do not bundle all 29 v8 plugins into the default load. Register them and enqueue on demand.
2. **Lazy-load optional plugins** (`table`, `code`, `codesample`, `media`, `autolink`, `wordcount`, `visualblocks`, `visualchars`, `searchreplace`, `preview`, `anchor`, `insertdatetime`, `save`, `importcss`, `quickbars`). Only load when a button or filter requests them.
3. **Do not lazy-load the model, theme, icons, or skin.** The editor cannot initialize without them.
4. **Use the minified build in production, uncompressed only under `SCRIPT_DEBUG`.**
5. **Serve vendor assets with long cache headers** and the `$tinymce_version` cache suffix. WordPress already does this; verify the new files are included.
6. **Avoid duplicating the skin CSS.** Register it once; do not inline it per editor.
7. **DFW and Classic block share the same assets.** Do not enqueue a second copy.
8. **Consider `?ver=` consolidation.** Too many distinct versions defeat caching. Use one `$tinymce_version` for all v8 files.

### 13.4 Measurement methodology

- Use a production build, not `SCRIPT_DEBUG`.
- Use a clean browser profile with cache disabled for cold measurements, then warm.
- Throttle to "Fast 3G" for mobile p95.
- Measure with the Performance API (`performance.mark`, `performance.measure`) around `tinymce.init` and the first `init` event.
- Record transferred bytes from the network panel, not the file size on disk.
- Run each measurement 10 times and report p50/p95.
- Store results in `tests/performance/results/` with the commit hash.

### 13.5 Known performance risks

| Risk | Impact | Mitigation |
|---|---|---|
| DOM model + silver theme load | +100–150 KB | Required; cannot drop |
| SVG icon pack | +20–40 KB | Ship only used icons |
| Oxide skin CSS | +30–50 KB | Use one skin, no dark variant by default |
| Stricter sanitizer | CPU on large paste | Debounce, measure, cap paste size |
| Multiple editors | Linear memory growth | Reuse plugins, destroy on remove |
| React/Gutenberg integration | Double init | Ensure one init per Classic block |
| Source maps in production | Bytes/parse | Do not ship maps |

### 13.6 Optimization backlog

If the budget is exceeded, in order:

1. Trim the default plugin list.
2. Trim the icon pack to used icons.
3. Remove unused skin variants.
4. Defer optional plugins.
5. Compress with brotli at the server (not a core change).
6. Split the editor bundle by screen (post editor vs. widgets).
7. Re-evaluate a custom lightweight skin (last resort; maintenance cost).

Do not micro-optimize before measuring. Do not ship a custom build of TinyMCE that diverges from upstream; the maintenance cost outweighs the bytes.

---

## 14. Accessibility and internationalization

### 14.1 Accessibility requirements

Target: **WCAG 2.2 AA** for the editor chrome, matching WordPress's admin accessibility standards.

| Area | Requirement |
|---|---|
| Keyboard | Every action reachable without a mouse; logical tab order; no traps outside dialogs |
| Focus | Visible focus ring; focus returns to trigger after dialogs; focus moves into menus |
| Screen readers | Toolbar groups labelled; toggle state announced; dialogs have accessible names; live regions for notifications |
| Color | 4.5:1 text contrast, 3:1 UI contrast; do not rely on color alone |
| Motion | Respect `prefers-reduced-motion` |
| Touch | 24×24 minimum targets; 44×44 preferred |
| Zoom | Usable at 200% and 400% |
| RTL | Mirrored layout, logical tab order, correct punctuation |

### 14.2 What changes in v8

| Change | Accessibility impact | Action |
|---|---|---|
| `highlight_on_focus: true` | Adds a focus outline to the content area | Keep; verify contrast |
| New toolbar | Different DOM and keyboard model | Full keyboard test |
| Native dialogs | Focus trap, Escape, return focus | Test with NVDA/VoiceOver |
| Split buttons | Two focusable parts | Verify labels and keyboard |
| Notifications | Always-visible close button | Verify screen-reader text |
| Toolbar drawer | Overflow behavior | Verify hidden items are reachable |
| Inline toolbars (`tox-pop`) | New focus behavior | Test link/image/view toolbars |
| Status bar | Element path/resize | Verify labels |
| Skin | New contrast values | Audit |

### 14.3 Audit plan

1. **Automated:** axe-core on the editor page, toolbar open, each dialog, each inline toolbar.
2. **Keyboard:** tab through every control, open/close menus, use shortcuts, escape dialogs.
3. **Screen reader:** NVDA on Windows/Firefox, VoiceOver on macOS/Safari and iOS.
4. **Zoom/reflow:** 200% and 400%, 320 px width.
5. **RTL:** Arabic/Hebrew locale, mirrored layout.
6. **Cognitive:** plain-language labels, no time limits, error prevention.

Findings are tracked as P1 (blocks a task), P2 (significant friction), P3 (polish). No P1/P2 at RC.

### 14.4 Internationalization

TinyMCE 8 language packs:

- File names use **RFC 5646** (`en-GB.js`, `pt-BR.js`, `zh-CN.js`).
- Underscore names (`en_GB.js`) are accepted in 8.x but removed in 9. WordPress must emit hyphens.
- WordPress locales use underscores (`en_GB`, `pt_BR`) internally. Normalize at the URL boundary:

```php
$mce_locale = str_replace( '_', '-', get_locale() );
```

- Keep a fallback to the underscore file for 8.x if the hyphenated file is missing.
- Do not rename WordPress's own translation files; only the TinyMCE language URL changes.

### 14.5 String extraction and translation

- WordPress's editor strings live in `class-wp-editor.php` and the `wordpress` plugin. Keep them in the same text domain (`default` for core).
- v8's UI strings come from its own language pack. Do not duplicate them in WordPress.
- `wp_mce_translation()` merges WordPress strings into `tinyMCE.addI18n()`. Verify the merge order: WordPress strings must win for WP-specific buttons.
- New strings need translator comments and a `@since` entry.
- Do not concatenate translated strings to build sentences.
- Test a locale with a long translation (German) and an RTL locale (Arabic).

### 14.6 RTL

- v8 handles RTL with `[dir=rtl]` and CSS logical properties in the skin. There is no separate RTL file.
- `_mce_set_direction()` should set `directionality: 'rtl'` and add the `directionality` plugin/`ltr` button.
- Remove `rtl_ui`; it no longer exists.
- Test:
  - toolbar order and overflow;
  - menus and submenus;
  - dialogs and buttons;
  - inline toolbars and tooltips;
  - status bar;
  - content direction and punctuation;
  - mixed LTR/RTL content.

### 14.7 Translation timing

TinyMCE loads language files asynchronously. If the editor initializes before the language file arrives, the UI flashes English. WordPress currently uses `ScriptLoader.markDone()` to coordinate. v8 still supports this, but verify:

- the language script is loaded before `tinymce.init`;
- `markDone` is called only after the file is available;
- a missing language file falls back to English without blocking init;
- the `lang` attribute is set on the editor body.

### 14.8 Accessibility and i18n test matrix

| Test | Tool | Frequency |
|---|---|---|
| axe-core | Playwright | Every PR |
| Keyboard-only | Manual | Every phase |
| NVDA | Manual | G3, G5, G9 |
| VoiceOver | Manual | G3, G5, G9 |
| 200%/400% zoom | Manual | G5, G9 |
| RTL layout | Screenshot + manual | G5, G9 |
| Long translations (de_DE) | Screenshot | G5, G9 |
| Missing language pack | Unit test | Every PR |

---

## 15. Risks, effort, and open decisions

### 15.1 Risk register

Likelihood and impact are High/Medium/Low. "Trigger" is the observable signal that the risk is materializing.

| ID | Risk | Likelihood | Impact | Mitigation | Trigger |
|---|---|---|---|---|---|
| R1 | Ecosystem breakage exceeds the shim's coverage | High | High | Feature plugin, compatibility tiers, `compat4x`, long beta | <80% of Tier A plugins pass at beta |
| R2 | `compat4x` cannot reproduce `tinymce.ui.*` well enough | High | Medium | Best-effort subset, document unsupported, port WP code natively | More than 20% of fixtures fail on UI APIs |
| R3 | Content serialization changes break posts | Medium | **Critical** | `element_format: 'xhtml'`, golden corpus, conservative schema | Any unapproved diff on the corpus |
| R4 | `wp_adv` has no clean v8 equivalent | High | Medium | Spike first; fallback to drawer/menu | Spike fails all three approaches |
| R5 | Gutenberg Classic block breaks | Medium | High | Gutenberg liaison, PR, E2E, legacy classes as fallback | Classic block E2E red |
| R6 | Performance exceeds budget | Medium | Medium | Lazy plugins, trimmed icons, measured budget | Default set >380 KB gzip |
| R7 | Accessibility regressions | Medium | High | Audit at each gate, native dialogs, keyboard tests | Any P1/P2 a11y issue at RC |
| R8 | v8 security issue with no upstream fix | Low | **Critical** | Pin, monitor, rollback plugin, vendor patch process | Advisory with no fix |
| R9 | Licensing/redistribution problem | Low | High | Legal review, GPL key, notices | Legal objection |
| R10 | Maintainer burnout / project stall | Medium | High | Named owners, funded time, scope cuts | Two missed gates |
| R11 | Scope creep (new editor features) | High | Medium | Charter non-goals, change control | New feature requests in Phase 3+ |
| R12 | Core release schedule slips | Medium | Medium | Feature plugin ships independently; core merge is a separate gate | Beta date moves twice |
| R13 | Hosting resistance / mass rollback | Low | High | Communication, rollback plugin, early hosting testing | Rollback activations spike |
| R14 | Translation/language pack failures | Medium | Medium | Hyphenated locale mapping, fallback, RTL tests | Missing UI strings in a locale |
| R15 | Third-party plugin bundles its own TinyMCE 4 | Medium | Medium | Detect and warn; do not load two editors | `tinymce` already defined at load |
| R16 | Custom v4 skins/themes stop working | High | Low | Document; `compat4x` legacy classes only | Reports of broken skins |
| R17 | jQuery-dependent WP code breaks | Low | Medium | Keep jQuery where used; do not remove it as part of this project | JS errors in `base.js`/`dfw.js` |
| R18 | Editor conflicts with page builders | Medium | High | Test top builders; provide filters | Builder editor fails to init |
| R19 | `sandbox_iframes` breaks embeds | High | Medium | Provider allowlist, tests | Embed corpus failures |
| R20 | Feature plugin becomes permanent | Medium | Medium | Exit criteria, deprecation schedule | No core merge decision by G7 |

### 15.2 Effort and staffing scenarios

| Scenario | Contributors | Calendar | Confidence | Notes |
|---|---:|---|---|---|
| Funded team | 5–6 | 10–12 months | Medium | Parallel plugin ports and tests |
| Recommended | 4 | 12–15 months | Medium | Critical path dominates |
| Minimal | 2 | 20–26 months | Low | Only if the same two people cover JS and PHP |
| Volunteer-only | 1–2 part-time | 24–36 months | Very low | High abandonment risk; not recommended |

The **91 person-week** estimate includes contingency. The raw file work is ~37 person-weeks (Section 9.9); the rest is review, testing, ecosystem support, release management, and the inevitable unknowns.

### 15.3 Open questions

These must be answered before the phase that depends on them. Owners are roles, not names.

| ID | Question | Owner | Needed by | Default if unresolved |
|---|---|---|---|---|
| Q1 | Native `text_patterns` or keep `wptextpattern`? | Editor JS | Phase 4 | Keep `wptextpattern`, disable native |
| Q2 | Native v8 dialogs or keep WP modals for link/image/media? | Editor JS + UX | Phase 3 | Keep WP modals; native only for WP-owned dialogs |
| Q3 | `wp_adv`: CSS row toggle, drawer, or menu? | Editor JS + UI | Phase 3 | Drawer via `ToggleToolbarDrawer` |
| Q4 | `element_format: 'xhtml'` or `'html'`? | Lead + content | Phase 2 | `'xhtml'` for the transitional release |
| Q5 | `sandbox_iframes` on, off, or allowlist? | Security | Phase 5 | On + allowlist |
| Q6 | Vertical-only resize or both directions? | UX | Phase 3 | Both, with a WP CSS constraint |
| Q7 | Does `compat4x` ship in core permanently? | Lead | Phase 7 | One major in core, then optional plugin |
| Q8 | Does `wpdialogs` survive as opt-in? | Editor JS | Phase 4 | Opt-in only, removed in +1 major |
| Q9 | Do `media` and `image` stock plugins remain? | Editor JS | Phase 2 | No; use `wp.media` and core image |
| Q10 | Custom skin or oxide + overrides? | UI | Phase 3 | Oxide + overrides |
| Q11 | Minimum supported browser versions? | Lead | Phase 1 | WordPress 7.2 policy |
| Q12 | Is `code`/`codesample` usable under the GPL key? | Legal + JS | Phase 2 | Verify; drop if premium-gated |
| Q13 | How long is the `compat4x` support window? | Lead | Phase 7 | Two major releases |
| Q14 | Who owns the rollback plugin post-release? | Lead | Phase 9 | Core editor maintainers |
| Q15 | What is the compatibility tracker's public format? | Docs | Phase 0 | GitHub project + weekly summary |
| Q16 | Do we ship a v4 security fork if the migration stops? | Lead | Phase 7 | No, unless a critical CVE appears |
| Q17 | How are third-party bundled TinyMCE 4 instances handled? | Editor JS | Phase 2 | Detect and warn; no dual init |
| Q18 | What is the deprecation policy for `wp-tinymce.js`? | Core | Phase 8 | Deprecation notice + one major |
| Q19 | Is `autoresize` native or custom? | Editor JS | Phase 4 | Native + thin WP layer |
| Q20 | Which Gutenberg release pairs with core? | Gutenberg liaison | Phase 8 | Same cycle, PR before core beta |

### 15.4 Decision log

Record decisions with date, owner, rationale, and reversibility.

| ID | Decision | Status | Date | Owner | Reversible? |
|---|---|---|---|---|---|
| D1 | Migrate directly to TinyMCE 8.x | Accepted | 2026-10-25 | Lead | Yes (stop before core merge) |
| D2 | Feature-plugin-first, not big-bang | Accepted | 2026-10-25 | Lead | No (charter) |
| D3 | Build an in-house `compat4x` | Accepted | 2026-10-25 | Lead | Yes |
| D4 | Native port of WP code; shim for third parties only | Accepted | 2026-10-25 | Lead | No (principle) |
| D5 | `license_key: 'gpl'`, `promotion: false`, `branding: false` | Accepted | 2026-10-25 | Lead | No (legal) |
| D6 | `element_format: 'xhtml'` for the first release | Proposed | — | Lead | Yes |
| D7 | Keep `wptextpattern`; disable native patterns | Proposed | — | Editor JS | Yes |
| D8 | Remove `wpdialogs` from defaults | Proposed | — | Editor JS | Yes |
| D9 | Use oxide + WP overrides, no custom skin | Proposed | — | UI | Yes |
| D10 | `sandbox_iframes` on + provider allowlist | Proposed | — | Security | Yes |
| D11 | `compat4x` in core for one major, then plugin | Proposed | — | Lead | Yes |
| D12 | No dual-editor core release | Accepted | 2026-10-25 | Lead | No |

### 15.5 Contingency plans

**If the feature plugin stalls before G2:**

- Publish the research, the vendor spike, and the compatibility findings.
- Do not merge anything into core.
- Keep v4 with a security watch. If a critical CVE appears, fund a minimal backport.

**If `compat4x` cannot reach the coverage gate:**

- Ship the native port and a smaller compatibility plugin.
- Publish a list of unsupported APIs and migration recipes.
- Extend the beta; do not lower the gate silently.

**If content parity fails:**

- Stop. Content is non-negotiable.
- Narrow the serializer differences with `element_format`, `valid_elements`, and targeted filters.
- If parity still fails, do not ship; the upgrade is not ready.

**If Gutenberg is not ready:**

- Delay the core merge until the Gutenberg PR is merged.
- Do not rely on a compat CSS shim for a Gutenberg release.

**If a critical v8 security issue appears:**

- Pin to the last good version.
- Apply a vendor patch with a documented diff.
- Activate the rollback plan if the issue is exploited in the wild.

### 15.6 Success metrics

| Metric | Target |
|---|---|
| Tier A plugin compatibility | 100% |
| Tier B plugin compatibility | ≥90% load, ≥80% full behavior |
| Content corpus diffs | 0 unapproved |
| P1 bugs at RC | 0 |
| P2 bugs at RC | 0 |
| Accessibility P1/P2 at RC | 0 |
| Default payload | ≤380 KB gzip |
| Editor init p95 | ≤ baseline +400 ms |
| Support forum regression rate | Within normal release variance |
| Rollback activations | <0.5% of active installs |

---

## 16. Definition of done

### 16.1 Code

- [ ] TinyMCE 8.10.x is the only bundled editor; v4 and `compat3x` are removed.
- [ ] `compat4x` is present for third parties and absent from WP-owned code paths.
- [ ] All nine WP plugins use v8 APIs (`editor.ui.registry`, `editor.options`, `EditorManager`, `Env.browser/os`).
- [ ] No `tinymce.ui.*`, `editor.settings`, `tinymce.$`, `editor.theme.panel`, `editor.addButton`, `editor.addMenuItem`, `tinymce.editors`, or `Env.ie` in WP-owned JS.
- [ ] `class-wp-editor.php`, `script-loader.php`, `_mce_set_direction()`, and `update-core.php` are updated.
- [ ] `Gruntfile.js` builds v8 and no longer concatenates `wp-tinymce.js`.
- [ ] Vendor license and notices are present.
- [ ] The build has no source maps or dev files in production.

### 16.2 Behavior

- [ ] Classic editor, Classic block, widgets, Customizer, and front-end `wp_editor()` work.
- [ ] Every default toolbar button works, including `wp_adv`, `wp_more`, `wp_page`, `wp_help`, `wp_add_media`, `dfw`, `wp_code`, and `pastetext`.
- [ ] Link, image, gallery, and view inline toolbars work and are keyboard accessible.
- [ ] Paste from Word/Google Docs/LibreOffice works and is sanitized.
- [ ] Text patterns, undo/redo, and IME behavior match or exceed v4.
- [ ] DFW works at all breakpoints.
- [ ] Autoresize works.
- [ ] Emoji works.
- [ ] RTL works.
- [ ] Language packs load; missing packs fall back to English.

### 16.3 Content

- [ ] The 85-fixture corpus round-trips with zero unapproved diffs.
- [ ] `<!--more-->`, `<!--nextpage-->`, shortcodes, captions, galleries, and embeds survive save/reload.
- [ ] `wp_kses` and the v8 sanitizer agree on the allowed set.
- [ ] No content loss on rollback to v4 (within the support window).

### 16.4 Tests

- [ ] PHPUnit, QUnit, E2E, visual, and a11y suites are green.
- [ ] The compat fixture suite is green.
- [ ] Tier A/B compatibility matrix is published.
- [ ] CI blocks on size, license, and v4 API searches.
- [ ] The rollback drill has been run.

### 16.5 Documentation

- [ ] Core dev note published.
- [ ] Plugin migration guide published.
- [ ] Theme/editor-style guide published.
- [ ] Hosting/rollback runbook published.
- [ ] `compat4x` deprecation schedule published.
- [ ] Known issues documented.

### 16.6 Release

- [ ] No open P1/P2.
- [ ] Accessibility sign-off.
- [ ] Security sign-off.
- [ ] Performance within budget.
- [ ] Gutenberg PR merged or on track.
- [ ] Rollback plugin available and tested.
- [ ] Support rotation staffed for 8 weeks.
- [ ] Postmortem scheduled.

### 16.7 Post-release

- [ ] Monitor support forums and compatibility reports daily for 2 weeks, weekly for 8 weeks.
- [ ] Triage every `tinymce-8` report.
- [ ] Publish a compatibility update at +2 weeks and +8 weeks.
- [ ] Remove `compat4x` on the published schedule.
- [ ] Write the postmortem with metrics and lessons.

---

## Appendix A — Complete file change list

### A.1 Add

| Path | Purpose |
|---|---|
| `src/js/_enqueues/vendor/tinymce/tinymce.min.js` | v8 core |
| `src/js/_enqueues/vendor/tinymce/tinymce.js` | Uncompressed core for `SCRIPT_DEBUG` (optional) |
| `src/js/_enqueues/vendor/tinymce/models/dom/model.min.js` | v8 DOM model |
| `src/js/_enqueues/vendor/tinymce/themes/silver/theme.min.js` | v8 theme |
| `src/js/_enqueues/vendor/tinymce/icons/default/icons.min.js` | v8 icons |
| `src/js/_enqueues/vendor/tinymce/skins/ui/oxide/**` | v8 UI skin |
| `src/js/_enqueues/vendor/tinymce/skins/content/default/**` | v8 content skin |
| `src/js/_enqueues/vendor/tinymce/plugins/{charmap,lists,fullscreen,...}/plugin.min.js` | Stock plugins actually used |
| `src/js/_enqueues/vendor/tinymce/license.md` | v8 license |
| `src/js/_enqueues/vendor/tinymce/notices.txt` | Third-party notices |
| `src/js/_enqueues/vendor/tinymce/plugins/wpicons/plugin.js` (or `wordpress/icons.js`) | WP SVG icon pack |
| `src/js/_enqueues/vendor/tinymce/plugins/wordpress/ui.js` | Shared v8 UI registration |
| `src/js/_enqueues/vendor/tinymce/plugins/compat4x/plugin.js` | Compatibility layer |
| `src/js/_enqueues/vendor/tinymce/plugins/compat4x/plugin.min.js` | Built compat layer |
| `tests/phpunit/tests/editor/wpEditorSettings.php` | Settings tests |
| `tests/phpunit/tests/editor/wpEditorScripts.php` | Script tests |
| `tests/phpunit/tests/editor/wpMceTranslation.php` | Translation tests |
| `tests/qunit/wp-includes/js/tinymce/plugins/compat4x/plugin.js` | Compat tests |
| `tests/qunit/wp-includes/js/tinymce/plugins/wordpress/ui.js` | UI tests |
| `tests/e2e/specs/editor/*.test.js` | E2E specs |
| `tests/visual-regression/snapshots/editor/**` | Baselines |
| `tests/fixtures/content/**` | Corpus |
| `docs/tinymce-8-migration.md` | Migration guide |
| `docs/tinymce-8-dev-note.md` | Dev note draft |
| `docs/tinymce-8-rollback.md` | Rollback runbook |

### A.2 Modify

| Path | Change |
|---|---|
| `src/wp-includes/class-wp-editor.php` | Core settings, plugins, toolbars, scripts, translations |
| `src/wp-includes/script-loader.php` | Script registration, inline settings |
| `src/wp-includes/functions.php` | `_mce_set_direction()` |
| `src/wp-admin/includes/update-core.php` | Legacy file cleanup |
| `src/wp-includes/kses.php` | Allowed iframe/embed attributes |
| `src/wp-includes/media.php` | Embed sandbox policy |
| `src/wp-includes/formatting.php` | Entity/URL edge cases |
| `src/js/_enqueues/wp/editor/base.js` | v8 init, height, selectors |
| `src/js/_enqueues/wp/editor/dfw.js` | v8 panels/selectors/height |
| `src/js/_enqueues/wp/mce-view.js` | `EditorManager`, `Env`, CSS |
| `src/js/_enqueues/wp/media/editor.js` | Verify integration |
| `src/js/_enqueues/wp/widgets/text.js` | Verify init/remove |
| `src/js/_enqueues/wp/customize/controls.js` | Remove `FloatPanel.zIndex` |
| `src/js/_enqueues/wp/admin/post.js` | `.mce-*` selector |
| `src/js/_enqueues/vendor/tinymce/plugins/wordpress/plugin.js` | Native port |
| `src/js/_enqueues/vendor/tinymce/plugins/wplink/plugin.js` | Native port |
| `src/js/_enqueues/vendor/tinymce/plugins/wpeditimage/plugin.js` | Native port |
| `src/js/_enqueues/vendor/tinymce/plugins/wpview/plugin.js` | Native port |
| `src/js/_enqueues/vendor/tinymce/plugins/wptextpattern/plugin.js` | Native port |
| `src/js/_enqueues/vendor/tinymce/plugins/wpautoresize/plugin.js` | Native port |
| `src/js/_enqueues/vendor/tinymce/plugins/wpemoji/plugin.js` | Sanitizer allowlist |
| `src/js/_enqueues/vendor/tinymce/plugins/wpgallery/plugin.js` | Native port |
| `src/js/_enqueues/vendor/tinymce/plugins/wpdialogs/plugin.js` | Opt-in translator |
| `src/wp-includes/css/editor.css` | `.tox-*` rewrite |
| `src/wp-admin/css/edit.css` | Editor wrap/DFW/mobile |
| `src/wp-admin/css/customize-widgets.css` | Widget editor |
| `Gruntfile.js` | Vendor copy, remove concat, checks |
| `package.json` | Size/license checks |
| `tests/phpunit/tests/editor/wpTinyMceInlineScripts.php` | Expected output |
| `tests/phpunit/tests/functions/mceSetDirection.php` | `rtl_ui` removal |
| `tests/phpunit/tests/dependencies/scripts.php` | `compat4x` handles |
| `tests/qunit/wp-includes/js/tinymce/tinymce-obsolete.js` | v8 removals |
| `tests/qunit/wp-includes/js/tinymce/plugins/wptextpattern/plugin.js` | v8 behavior |
| Gutenberg `packages/block-library/src/freeform/editor.scss` | `.tox-*` or legacy classes |
| Gutenberg `packages/block-library/src/freeform/edit.js` | Init/focus/content sync |

### A.3 Remove

| Path | Reason |
|---|---|
| `src/js/_enqueues/vendor/tinymce/tinymce.js` (v4) | Replaced by v8 |
| `src/js/_enqueues/vendor/tinymce/themes/modern/**` | Removed theme |
| `src/js/_enqueues/vendor/tinymce/themes/inlite/**` | Removed theme |
| `src/js/_enqueues/vendor/tinymce/skins/lightgray/**` | Removed skin |
| `src/js/_enqueues/vendor/tinymce/plugins/compat3x/**` | Replaced by `compat4x` |
| `src/js/_enqueues/vendor/tinymce/plugins/{colorpicker,hr,paste,tabfocus,textcolor}/**` | Bundled in WP today, not in the v8 package (merged into core or removed). `image`, `media`, `link`, `lists`, `charmap`, `directionality`, `fullscreen` exist in v8 and are replaced with the v8 versions, not deleted. |
| `src/js/_enqueues/vendor/tinymce/wp-tinymce.js` (build artifact) | No longer registered |
| `src/js/_enqueues/vendor/tinymce/wp-tinymce.php` | Legacy loader; replace with a deprecation stub or remove |
| `src/js/_enqueues/vendor/tinymce/license.txt` | Replaced by `license.md` and `notices.txt` |
| `src/wp-includes/js/tinymce` build copy of removed files | Build output |

**Do not remove** `charmap`, `lists`, `fullscreen`, `directionality`, `link`, `wordcount`, `autolink`, `code`, `table`, `media` (if a filter uses it), or any plugin still referenced by a filter. Run a code search before deleting.

### A.4 Version pinning

| File | Pin |
|---|---|
| `src/js/_enqueues/vendor/tinymce/tinymce.min.js` | 8.10.0 |
| `package.json` (dev dependency, if added) | `tinymce@8.10.0` |
| `$tinymce_version` | `8100-YYYYMMDD` |
| `license_key` | `gpl` |
| Build manifest | SHA-256 of the vendor archive |

Record the exact npm tarball URL and hash in `docs/tinymce-8-vendor.md`. Upgrades within 8.x are allowed after the migration, subject to the same compatibility and content tests.

---

## Appendix B — v4 → v8 API mapping

Legend: **K** = kept and compatible, **R** = renamed/replaced, **S** = shimmed by `compat4x`, **X** = removed with no shim, **N** = new in v8.

### B.1 Editor lifecycle and core

| v4 API | v8 | Status | Notes |
|---|---|---|---|
| `tinymce.init(settings)` | same | K | Still the entry point. |
| `tinymce.EditorManager.init` | same | K | |
| `tinymce.EditorManager.get()` | same | K | Preferred over `tinymce.editors`. |
| `tinymce.EditorManager.overrideDefaults()` | same | K | Verified in 8.10. |
| `tinymce.get(id)` | same | K | |
| `tinymce.activeEditor` | same | K | |
| `tinymce.editors` | `EditorManager.get()` | S | Array-like shim. |
| `tinymce.PluginManager.add` | same | K | `compat4x` wraps it. |
| `tinymce.PluginManager.get` | same | K | |
| `tinymce.ThemeManager` | removed | X | Themes are selected by name. |
| `tinymce.ScriptLoader.markDone` | same | K | Used for i18n. |
| `tinymce.addI18n` | same | K | |
| `tinymce.IconManager.add` | N | N | WP icon pack. |
| `tinymce.Env.ie` | `Env.browser.isIE()` | S | IE unsupported; delete branches. |
| `tinymce.Env.iOS` | `Env.os.isiOS()` | S | |
| `tinymce.Env.mac` | `Env.os.isMacOS()` | S | |
| `tinymce.Env.webkit` | `Env.browser.isWebKit()` | S | |
| `tinymce.Env.gecko` | `Env.browser.isGecko()` | S | |
| `tinymce.isIE` | `Env.browser.isIE()` | S | |
| `tinymce.isWebKit` | `Env.browser.isWebKit()` | S | |
| `tinymce.$` | none | S | Small DOM wrapper; prefer native. |
| `tinyMCEPreInit.baseURL` | same | K | |
| `tinyMCEPreInit.suffix` | same | K | |
| `tinymce.util.VK` | same | K | |
| `tinymce.util.Delay` | same | K | |
| `tinymce.util.Tools.resolve` | same | K | |
| `tinymce.util.XHR` | removed | S | `fetch` wrapper. |
| `tinymce.util.Promise` | native `Promise` | S | |
| `tinymce.util.JSON` | native `JSON` | S | |
| `tinymce.util.JSONRequest` | removed | S | `fetch` wrapper. |
| `tinymce.html.DomParser` | same | K | |
| `tinymce.html.Serializer` | same | K | |
| `tinymce.html.Schema` | same | K | |
| `tinymce.html.Writer` | same | K | |
| `tinymce.html.SaxParser` | removed | S | Subset reimplementation. |
| `tinymce.dom.RangeUtils.getCaretRangeFromPoint` | same | K | |
| `tinymce.DOM` | same | K | |
| `tinymce.WindowManager` | same (new schema) | R | |
| `tinymce.ui.*` | none | S | Best-effort subset. |

### B.2 Editor instance

| v4 API | v8 | Status | Notes |
|---|---|---|---|
| `editor.on/off/once` | same | K | |
| `editor.fire` | `editor.dispatch` | R | `fire` exists but deprecated. |
| `editor.dispatch` | same | K | |
| `editor.execCommand` | same | K | Command names may differ. |
| `editor.queryCommandState` | same | K | |
| `editor.queryCommandValue` | same | K | |
| `editor.insertContent` | same | K | |
| `editor.setContent` | same | K | |
| `editor.getContent` | same | K | |
| `editor.startContent` | same | K | |
| `editor.getBody` | same | K | |
| `editor.getDoc` | same | K | |
| `editor.iframeElement` | same | K | |
| `editor.getContainer` | same | K | |
| `editor.getWin` | same | K | |
| `editor.parser` | same | K | |
| `editor.serializer` | same | K | |
| `editor.schema` | same | K | |
| `editor.options` | N | N | Preferred over `editor.settings`. |
| `editor.getParam` | `editor.options.get` | R | Still exists but deprecated. |
| `editor.settings` | `editor.options.get` | S | Proxy. |
| `editor.addButton` | `ui.registry.addButton` | S | |
| `editor.addMenuItem` | `ui.registry.addMenuItem` | S | |
| `editor.buttons` | registry | S | |
| `editor.ui.registry` | N | N | Target API. |
| `editor.theme.panel` | none | X/S | Cannot reproduce arbitrary panels. |
| `editor.theme.resizeTo` | CSS height | S | WP helper. |
| `editor.windowManager` | same (new schema) | R | |
| `editor.notificationManager` | same | K | Verify. |
| `editor.selection.getContent` | same | K | |
| `editor.selection.setContent` | same | R | Deprecated for v9. |
| `editor.selection.getNode` | same | K | |
| `editor.selection.getSel` | same | K | |
| `editor.selection.getRng` | same | K | |
| `editor.dom.*` | same | K | Most methods remain. |
| `editor.undoManager` | same | K | |
| `editor.settings` | see above | S | |
| `editor.documentBaseUrl` | option | S | |
| `editor.buttons` | see above | S | |

### B.3 UI registry

| v4 API | v8 | Status | Notes |
|---|---|---|---|
| `editor.addButton(id, {text, icon, onclick, cmd})` | `addButton({text, icon, onAction})` | R | `onclick` → `onAction`; `cmd` → `onAction: () => editor.execCommand(cmd)`. |
| `editor.addButton(id, {type: 'listbox', values, onselect})` | `addMenuButton` / `addListBox` | R | Check exact registry method in 8.10. |
| `editor.addButton(id, {type: 'splitbutton', menu})` | `addSplitButton` | R | DOM changed in v8. |
| `editor.addToggleButton` | `addToggleButton` | R | |
| `editor.addMenuItem(id, {context, menu, cmd})` | `addMenuItem` / `addNestedMenuItem` | R | |
| `editor.addContextToolbar` | same | K | |
| `editor.addContextForm` | N | N | |
| `editor.ui.registry.addIcon` | `IconManager.add` | R | |
| `editor.ui.registry.addAutocompleter` | N | N | |
| `editor.ui.registry.addMenuButton` | N | N | |
| `editor.ui.registry.addSplitButton` | N | N | |
| `editor.ui.registry.addListBox` | N | N | |
| `editor.ui.registry.addSidebar` | N | N | |
| `editor.ui.registry.addGroupToolbarButton` | N | N | |

**Button option mapping:**

| v4 | v8 |
|---|---|
| `text` | `text` |
| `icon` | `icon` (registered SVG name) |
| `image` | `icon` with a data URI, or `text` |
| `tooltip` | `tooltip` |
| `onclick` | `onAction` |
| `cmd` | `onAction: () => editor.execCommand(cmd)` |
| `stateSelector` | `onSetup` + `api.setActive()` |
| `onPostRender` | `onSetup` |
| `disabled` | `onSetup` + `api.setEnabled()` |
| `hidden` | `onSetup` + `api.setVisible()` |
| `menu` | `addMenuButton` / `addSplitButton` |
| `context` | `addMenuItem` context |
| `onselect` | `onAction` / `onItemAction` |

### B.4 Dialogs

| v4 API | v8 | Status |
|---|---|---|
| `windowManager.open({title, body: [...]})` | `{title, body: {type:'panel', items:[...]}}` | R |
| `windowManager.open({url, width, height})` | `{body: {type:'iframe', url}}` | R |
| `windowManager.open({buttons: [{text, onclick}]})` | `buttons: [{type:'custom', text, onAction}]` | R |
| `windowManager.open({onSubmit})` | `onSubmit(api)` + `api.getData()` | R |
| `windowManager.close()` | `dialogApi.close()` | R |
| `windowManager.alert/info/confirm` | `editor.windowManager.alert/info/confirm` | K |
| `editor.windowManager.open` | same | K |
| `editor.windowManager.getWindows` | removed | X |
| `editor.windowManager.windows` | removed | X |

### B.5 Content and serialization

| v4 | v8 | Status |
|---|---|---|
| `forced_root_block: false` | invalid | X |
| `forced_root_block: 'p'` | same | K |
| `element_format: 'xhtml'` | same | K |
| `element_format: 'html'` | default | K |
| `entity_encoding: 'raw'` | same | K |
| `verify_html` | same | K |
| `valid_elements` | same | K |
| `extended_valid_elements` | same | K |
| `invalid_elements` | same | K |
| `keep_styles` | same | K |
| `convert_urls` | same | K |
| `relative_urls` | same | K |
| `remove_script_host` | same | K |
| `document_base_url` | same | K |
| `content_css` | same | K |
| `content_style` | same | K |
| `body_class` | same | K |
| `browser_spellcheck` | same | K |
| `paste_as_text` | same | K |
| `paste_preprocess` | same | K |
| `paste_postprocess` | same | K |
| `text_patterns` | same (core) | K |
| `text_patterns_lookup` | same | K |
| `sandbox_iframes` | N (v7+) | N |
| `convert_unsafe_embeds` | N (v7+) | N |
| `highlight_on_focus` | N (v7+) | N |
| `license_key` | N (v6+) | N |

---

## Appendix C — Toolbar and plugin quick reference

### C.1 Default toolbar, mapped

| Row | v4 default | v8 default |
|---|---|---|
| 1 | `formatselect, bold, italic, bullist, numlist, blockquote, alignleft, aligncenter, alignright, link, wp_more, spellchecker, fullscreen, wp_adv` | `blocks, bold, italic, bullist, numlist, blockquote, alignleft, aligncenter, alignright, link, wp_more, wp_spellcheck, fullscreen, wp_adv` |
| 2 | `strikethrough, hr, forecolor, pastetext, removeformat, charmap, outdent, indent, undo, redo, wp_help` | `strikethrough, hr, forecolor, pastetext, removeformat, charmap, outdent, indent, undo, redo, wp_help` |
| 3 | filter-defined | filter-defined; map names |
| 4 | filter-defined | filter-defined; map names |

`dfw` replaces `fullscreen` on the front end when DFW is enabled. `wp_adv` is present on both rows by design; only one instance should be visible.

### C.2 Plugin list

| v4 plugin | v8 disposition | Notes |
|---|---|---|
| `charmap` | Keep | Stock plugin. |
| `colorpicker` | Drop | Native color UI. |
| `hr` | Drop | Core command. |
| `lists` | Keep | Stock plugin. |
| `media` | Drop by default | Use `wp.media`; opt-in via filter. |
| `paste` | Drop | Core. |
| `tabfocus` | Drop | Core. |
| `textcolor` | Drop | `forecolor`/`backcolor` are core. |
| `fullscreen` | Keep | Stock plugin. |
| `wordpress` | Keep, port | WP core plugin. |
| `wpautoresize` | Keep, thin | Or replace with stock `autoresize`. |
| `wpeditimage` | Keep, port | WP core plugin. |
| `wpemoji` | Keep, port | WP core plugin. |
| `wpgallery` | Keep, port | WP core plugin. |
| `wplink` | Keep, port | WP core plugin. |
| `wpdialogs` | Opt-in | Deprecated. |
| `wptextpattern` | Keep, port | Disable native `text_patterns`. |
| `wpview` | Keep, port | WP core plugin. |
| `image` | Drop | Core image editing. |
| `directionality` | Keep | RTL. |

### C.3 Button registration template

```js
( function ( tinymce ) {
    'use strict';

    function register( editor ) {
        var registry = editor.ui.registry;

        registry.addButton( 'wp_more', {
            icon: 'wp-more',
            tooltip: 'Insert Read More tag',
            onAction: function () {
                editor.insertContent( '<!--more-->' );
            }
        } );

        registry.addToggleButton( 'wp_adv', {
            icon: 'wp-adv',
            tooltip: 'Show more tools',
            onAction: function () {
                editor.dispatch( 'wp-toggle-advanced' );
            },
            onSetup: function ( api ) {
                function sync() {
                    api.setActive( editor.options.get( 'wp_advanced_visible' ) );
                }
                editor.on( 'wp-toggle-advanced', sync );
                return function () {
                    editor.off( 'wp-toggle-advanced', sync );
                };
            }
        } );

        registry.addButton( 'pastetext', {
            icon: 'pastetext',
            tooltip: 'Paste as text',
            onAction: function () {
                editor.execCommand( 'mceTogglePlainTextPaste' );
            }
        } );
    }

    tinymce.PluginManager.add( 'wordpress', function ( editor ) {
        register( editor );
    } );
} )( window.tinymce );
```

### C.4 Icon names

| Button | Icon name | Source |
|---|---|---|
| `wp_more` | `wp-more` | WP pack |
| `wp_page` | `wp-page` | WP pack |
| `wp_help` | `wp-help` | WP pack |
| `wp_adv` | `wp-adv` | WP pack |
| `wp_add_media` | `wp-media` | WP pack |
| `wp_image` | `wp-image` | WP pack |
| `wp_view` | `wp-view` | WP pack |
| `dfw` | `wp-dfw` | WP pack |
| `pastetext` | `pastetext` | v8 default |
| `fullscreen` | `fullscreen` | v8 default |
| `hr` | `horizontal-rule` | v8 default |
| `forecolor` | `text-color` | v8 default |
| `charmap` | `character-map` | v8 default |

Verify every name against the v8 icon pack at build time. A missing icon renders an empty button, which is easy to miss in review.

---

## Appendix D — Option mapping

### D.1 General options

| v4 option | v8 option | Status | Notes |
|---|---|---|---|
| `theme: 'modern'` | `theme: 'silver'` | R | `modern`/`inlite` removed. |
| `skin: 'lightgray'` | `skin: 'oxide'` | R | `lightgray` removed. |
| `toolbar1..9` | same | K | Multiple rows still supported. |
| `toolbar` | same | K | String form. |
| `toolbar_mode` | N | N | Cannot combine with `toolbar1..n`. |
| `menubar` | same | K | |
| `statusbar` | same | K | |
| `resize` | `true` / `'both'` | R | `'vertical'` removed. |
| `width`, `height` | same | K | |
| `min_height`, `max_height` | same | K | |
| `branding` | same | K | Also set `promotion: false`. |
| `promotion` | same | K | |
| `license_key` | N | N | Required for self-hosted. |
| `base_url` / `baseURL` | same | K | Emit both. |
| `suffix` | same | K | |
| `language` | same | K | |
| `language_url` | same | K | |
| `content_css` | same | K | |
| `content_style` | same | K | |
| `content_css_cors` | same | K | |
| `body_class` | same | K | |
| `body_id` | same | K | |
| `document_base_url` | same | K | |
| `convert_urls` | same | K | |
| `relative_urls` | same | K | |
| `remove_script_host` | same | K | |
| `entity_encoding` | same | K | |
| `element_format` | same | K | Default is `html`. |
| `forced_root_block` | same | K | `false` is invalid; use `'p'`. |
| `forced_root_block_attrs` | same | K | |
| `verify_html` | same | K | |
| `valid_elements` | same | K | |
| `extended_valid_elements` | same | K | |
| `invalid_elements` | same | K | |
| `keep_styles` | same | K | |
| `object_resizing` | same | K | |
| `browser_spellcheck` | same | K | Replaces `spellchecker`. |
| `contextmenu` | removed | X | Native context menus. |
| `text_patterns` | same | K | Core. |
| `text_patterns_lookup` | same | K | |
| `sandbox_iframes` | N | N | Default true in v7+. |
| `convert_unsafe_embeds` | N | N | Default true in v7+. |
| `highlight_on_focus` | N | N | Default true in v7+. |
| `mobile` | N | N | Mobile theme options. |
| `rtl_ui` | removed | X | Use `directionality`. |
| `tab_focus`, `tabfocus_elements` | removed | X | Core tab order. |

### D.2 Paste options

| v4 | v8 | Status |
|---|---|---|
| `paste_as_text` | same | K |
| `paste_data_images` | same | K |
| `paste_preprocess` | same | K |
| `paste_postprocess` | same | K |
| `paste_webkit_styles` | same | K |
| `paste_remove_styles_if_webkit` | same | K |
| `paste_merge_formats` | same | K |
| `paste_convert_word_fake_lists` | same | K |
| `paste_plaintext_inform` | removed | X; WP custom |
| `paste_auto_cleanup_on_paste` | removed | X |
| `paste_retain_style_properties` | removed | X |
| `paste_strip_class_attributes` | removed | X |
| `paste_remove_spans` | removed | X |

### D.3 Link options

| v4 | v8 | Status |
|---|---|---|
| `link_default_target` | same | K |
| `link_assume_external_targets` | same | K |
| `allow_unsafe_link_target` | same | K |
| `target_list` | `link_target_list` | R |
| `rel_list` | `link_rel_list` | R |
| `link_title` | same | K |
| `link_quicklink` | same | K |
| `default_link_target` | `link_default_target` | R |

### D.4 Image/media options

| v4 | v8 | Status |
|---|---|---|
| `image_uploadtab` | same | K |
| `images_upload_handler` | same | K |
| `images_upload_url` | same | K |
| `images_upload_base_path` | same | K |
| `images_upload_credentials` | same | K |
| `automatic_uploads` | same | K |
| `file_picker_types` | same | K |
| `file_picker_callback` | same | K |
| `media_url_resolver` | same | K | Must return a Promise. |
| `media_live_embeds` | same | K |
| `media_alt_source` | same | K |
| `media_poster` | same | K |
| `media_dimensions` | same | K |
| `media_filter_html` | same | K |
| `table_responsive_width` | `table_sizing_mode` | R |

### D.5 WordPress custom options

| Option | Where | v8 handling |
|---|---|---|
| `wp_paste_filters` | `wordpress` plugin | `editor.options.get('wp_paste_filters')` |
| `wp_shortcut_labels` | `wordpress` plugin | `editor.options.get('wp_shortcut_labels')` |
| `wptextpattern` | `wptextpattern` plugin | `editor.options.get('wptextpattern')` |
| `classic_block_editor` | `wpeditimage`/Classic block | `editor.options.get('classic_block_editor')` |
| `wp_adv` | toolbar | Custom button |
| `wp_advanced_visible` | WP UI | Custom option or user setting |
| `wpautoresize` | `wpautoresize` | `min_height`/`max_height` |
| `dfw` | `dfw.js` | Custom event |

---

## Appendix E — CSS selector mapping

| v4 selector | v8 selector | Use |
|---|---|---|
| `.mce-tinymce` | `.tox-tinymce` | Editor container |
| `.mce-container` | `.tox-tinymce` / `.tox-dialog` | Generic container |
| `.mce-container-body` | `.tox-tinymce` (inner) | Layout body |
| `.mce-toolbar-grp` | `.tox-editor-header` | Toolbar area |
| `.mce-toolbar` | `.tox-toolbar-overlord` | Toolbar wrapper |
| `.mce-btn-group` | `.tox-toolbar__group` | Button group |
| `.mce-btn` | `.tox-tbtn` | Toolbar button |
| `.mce-btn-hover` | `.tox-tbtn:hover` | Hover |
| `.mce-active` | `.tox-tbtn--enabled` | Active |
| `.mce-disabled` | `.tox-tbtn:disabled` | Disabled |
| `.mce-edit-area` | `.tox-edit-area` | Edit area |
| `.mce-iframe` | `.tox-edit-area__iframe` | Iframe |
| `.mce-statusbar` | `.tox-statusbar` | Status bar |
| `.mce-path` | `.tox-statusbar__path` | Element path |
| `.mce-resizehandle` | `.tox-statusbar__resize-handle` | Resize handle |
| `.mce-menu` | `.tox-menu` | Menu |
| `.mce-menu-item` | `.tox-collection__item` | Menu item |
| `.mce-floatpanel` | `.tox-pop` | Floating panel |
| `.mce-tooltip` | `.tox-tooltip` | Tooltip |
| `.mce-window` | `.tox-dialog` | Dialog |
| `.mce-window-head` | `.tox-dialog__header` | Dialog header |
| `.mce-window-body` | `.tox-dialog__body` | Dialog body |
| `.mce-window-foot` | `.tox-dialog__footer` | Dialog footer |
| `.mce-close` | `.tox-dialog__close` | Close button |
| `.mce-abs-layout` | `.tox-form` | Form layout |
| `.mce-textbox` | `.tox-textfield` | Text input |
| `.mce-listbox` | `.tox-listbox` | List box |
| `.mce-checkbox` | `.tox-checkbox` | Checkbox |
| `.mce-label` | `.tox-label` | Label |
| `.mce-panel` | `.tox-panel` | Panel |
| `.mce-i-*` | SVG icon | Icons |
| `.mce-rtl` | `[dir=rtl]` | RTL |
| `.mce-content-body` | `.mce-content-body` | Content body (kept) |
| `.mce-item-table` | `.mce-item-table` | Table (kept) |
| `.mce-item-anchor` | `.mce-item-anchor` | Anchor (kept) |
| `.mce-shim` | `.mce-shim` | Shim (kept) |
| `.mce-offscreen-selection` | `.mce-offscreen-selection` | Selection (kept) |

**Legacy classes for `compat4x`:**

Add the v4 class to the matching v8 element for one release. Do not add v8 classes to v4 elements; the direction is forward only.

---

## Appendix F — Test matrix and references

### F.1 Test matrix by phase

| Phase | PHPUnit | QUnit | E2E | Visual | A11y | Compat | Performance | Security |
|---|---|---|---|---|---|---|---|---|
| P0 | baseline | — | — | baseline | baseline | inventory | baseline | — |
| P1 | script order | boot | smoke | — | — | — | payload | license |
| P2 | filters | shims | fixture | — | — | 30 fixtures | — | — |
| P3 | — | UI | toolbar/dialogs | chrome | keyboard | — | — | — |
| P4 | — | plugins | plugins | — | inline UI | Tier A | — | — |
| P5 | — | serialization | content | full | — | paste | — | XSS/URL |
| P6 | — | — | Classic block | Classic block | focus | — | — | — |
| P7 | — | — | full | full | audit | Tier A/B | full | — |
| P8 | full | full | full | full | smoke | Tier A | full | audit |
| P9 | full | full | full | full | sign-off | Tier A/B/C | sign-off | sign-off |
| P10 | monitor | monitor | monitor | — | — | reports | monitor | monitor |

### F.2 Browser matrix

| Browser | P1 | P2 | Notes |
|---|---|---|---|
| Chrome current | ✓ | | Primary |
| Chrome current-1 | ✓ | | |
| Firefox current | ✓ | | |
| Firefox ESR | ✓ | | |
| Safari current | ✓ | | |
| Safari current-1 | ✓ | | |
| Edge current | | ✓ | |
| iOS Safari current | ✓ | | Touch, focus |
| iOS Safari current-1 | ✓ | | |
| Android Chrome | | ✓ | Touch |

### F.3 References

**TinyMCE**

- TinyMCE 4 → 8 migration guide: <https://www.tiny.cloud/docs/tinymce/8/migration-from-4x/>
- TinyMCE 5 → 8 migration guide: <https://www.tiny.cloud/docs/tinymce/8/migration-from-5x/>
- TinyMCE 6 → 8 migration guide: <https://www.tiny.cloud/docs/tinymce/8/migration-from-6x/>
- TinyMCE 7 → 8 migration guide: <https://www.tiny.cloud/docs/tinymce/8/migration-from-7x/>
- TinyMCE 8 options reference: <https://www.tiny.cloud/docs/tinymce/8/configuration/>
- TinyMCE 8 UI registry: <https://www.tiny.cloud/docs/tinymce/8/ui-components/>
- TinyMCE 8 license key: <https://www.tiny.cloud/docs/tinymce/8/license-key/>
- TinyMCE source: <https://github.com/tinymce/tinymce>
- TinyMCE license: <https://www.tiny.cloud/tinymce/license/>

**WordPress**

- Trac #47218 (TinyMCE upgrade, closed `wontfix` June 2025): <https://core.trac.wordpress.org/ticket/47218>
- ClassicPress-Editor (prior art, TinyMCE 5/6 plugin, fork): <https://github.com/Pross/ClassicPress-Editor>
- Gutenberg #78067 (Classic block/TinyMCE): <https://github.com/WordPress/gutenberg/issues/78067>
- WordPress core handbook: <https://make.wordpress.org/core/handbook/>
- WordPress coding standards: <https://developer.wordpress.org/coding-standards/>
- WordPress accessibility: <https://make.wordpress.org/accessibility/>
- WordPress browser support: <https://make.wordpress.org/core/handbook/best-practices/browser-support/>

**Related `wordpress-develop` PRs**

- #14775: <https://github.com/WordPress/wordpress-develop/pull/14775>
- #13262: <https://github.com/WordPress/wordpress-develop/pull/13262>
- #12718: <https://github.com/WordPress/wordpress-develop/pull/12718>
- #2308: <https://github.com/WordPress/wordpress-develop/pull/2308>
- #7750: <https://github.com/WordPress/wordpress-develop/pull/7750>
- #10678: <https://github.com/WordPress/wordpress-develop/pull/10678>
- #12103: <https://github.com/WordPress/wordpress-develop/pull/12103>
- #12783: <https://github.com/WordPress/wordpress-develop/pull/12783>
- #9162: <https://github.com/WordPress/wordpress-develop/pull/9162>

None of these PRs is a complete v8 upgrade. They are referenced for prior art on script registration, editor settings, and TinyMCE integration.

**Standards**

- WCAG 2.2: <https://www.w3.org/TR/WCAG22/>
- GPLv2: <https://www.gnu.org/licenses/old-licenses/gpl-2.0.html>
- DOMPurify: <https://github.com/cure53/DOMPurify>

### F.4 Glossary

| Term | Meaning |
|---|---|
| **Classic editor** | The `wp-admin/post.php` visual/HTML editor powered by TinyMCE. |
| **Classic block** | Gutenberg's `core/freeform` block, which embeds the classic editor. |
| **DFW** | Distraction-free writing mode. |
| **`compat4x`** | The in-house plugin that emulates removed TinyMCE 4 APIs on v8. |
| **`compat3x`** | The legacy 3.x → 4.x shim currently bundled with WordPress. |
| **Silver** | TinyMCE 8's theme. |
| **Oxide** | TinyMCE 8's default skin. |
| **`.tox-*`** | TinyMCE 8's UI class prefix. |
| **`.mce-*`** | TinyMCE 4's UI class prefix, still used for content classes. |
| **Tier A/B/C** | Compatibility tiers defined in Section 11.3. |

---

*End of plan.*
