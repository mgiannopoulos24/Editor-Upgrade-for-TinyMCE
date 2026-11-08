# Baseline and Phase 1 report

Results for `docs/plan.md` tasks P0.3, P1.5, P1.6, P1.7, and P1.8.

- **Measured:** 2026-11-07, on WordPress 7.1.3 in wp-env, with PHP 8.3 and `SCRIPT_DEBUG` off (production files).
- **Compared:** TinyMCE 4.9.11 with this plugin deactivated, and TinyMCE 8.10.0 with it active, at the Phase 2 code.
- **Not ported yet:** WordPress's own TinyMCE plugins, so the TinyMCE 8 numbers will change as they arrive.

## Payload

Files the classic editor loads for TinyMCE, gzipped by the test (Section 13.2 budgets).

| Metric | TinyMCE 4 | TinyMCE 8 | Budget | Result |
|---|---:|---:|---:|---|
| JavaScript | 222 KB | 424 KB | ≤ 300 KB | **Over by 124 KB** |
| CSS | 18 KB | 45 KB | ≤ 60 KB | Met |
| Total | 240 KB | 469 KB | ≤ 380 KB | **Over by 89 KB** |
| Requests | 25 | 14 | TinyMCE 4 + 4 | Met |

Largest TinyMCE 8 files, gzipped: `tinymce.min.js` 166 KB, `theme.min.js` 141 KB, `model.min.js` 32 KB, `icons.min.js` 29 KB, `compat4x.js` 27 KB (not minified yet), `skin.min.css` 26 KB.

The budget still has to be met, under exit criterion G6 in Section 6.10. `compat4x.js` is the obvious first saving, and Section 13.3 covers lazy loading.

## Init time

Milliseconds from navigation to the editor's `init` event, on a cold cache. Desktop Chrome is the median of 7 loads. The others are 11 loads, where p95 is the slowest load.

| Browser | TinyMCE 4 p50 | TinyMCE 8 p50 | Difference | TinyMCE 4 p95 | TinyMCE 8 p95 |
|---|---:|---:|---:|---:|---:|
| Chrome, desktop | 898 | 1012 | +114 | | |
| Firefox, desktop | 1296 | 1399 | +103 | 1741 | 1660 |
| WebKit, desktop | 1376 | 1486 | +110 | 1455 | 1544 |
| Chrome, Pixel 7 emulation | 861 | 978 | +117 | 917 | 1038 |
| WebKit, iPhone 14 emulation | 1357 | 1502 | +145 | 1479 | 1546 |

Budgets are +150 ms at p50 on desktop and +400 ms at p95 on mobile, and both are met. These are small samples on one local machine. The phone rows use no CPU throttling, so they do not reflect a real phone's speed.

With a warm cache on desktop Chrome, `init` takes 498 ms on TinyMCE 4 and 491 ms on TinyMCE 8.

TinyMCE 8 shows its toolbar later than TinyMCE 4, because it waits for the skin: 1074 ms against 893 ms on a cold cache, a difference of 181 ms. There is no budget for this.

Memory after 10 minutes (Section 13.2) has not been measured.

## Editor surfaces

Each of these has an automated test in `tests/e2e-pw/specs/`.

| Surface | Settings come from |
|---|---|
| Classic editor | `WP_Editor`, then `tiny_mce_before_init` |
| Classic block | `wp_tinymce_inline_scripts()` |
| Text widget, classic widgets screen | `wp.editor.getDefaultSettings()` |
| Text widget, Customizer | `wp.editor.getDefaultSettings()` |
| Front-end `wp_editor()` | `WP_Editor` |
| Teeny editor | `teeny_mce_before_init` |

## Browser matrix

| Browser | How it was tested | Result |
|---|---|---|
| Chromium | Playwright, full suite | Pass |
| Firefox | Playwright, full suite | Pass, with the issue below |
| WebKit | Playwright, full suite | Pass |
| Chrome on Android | Playwright Pixel 7 emulation, boot, type, save, dialog | Pass |
| Safari on iOS | Playwright iPhone 14 emulation with WebKit, boot, type, save, dialog | Pass |
| **Real Safari on macOS** | Not tested | **Open: needs a Mac** |
| **Real Safari on iOS** | Not tested | **Open: needs a device** |
| **Real Chrome on Android** | Not tested | **Open: needs a device** |
| **Firefox ESR** | Not tested | **Open: Playwright does not ship it** |

Playwright's WebKit build is not Safari, and emulation only sets the screen size, user agent, and touch input.

### Known browser issues

- **Firefox, dialogs:** in Playwright's Firefox, opening a TinyMCE 8 dialog leaves focus in the editor, so Escape does not close it. Stock TinyMCE 8.10 does the same without WordPress. This has not been checked in real Firefox.
- **Firefox, paste tests:** Firefox ignores `clipboardData` in a synthetic `ClipboardEvent`, so paste tests are skipped there. Paste in Firefox has no automated coverage.

## Language loading

Checked with German and Hebrew on TinyMCE 4 and TinyMCE 8.

| Check | Result |
|---|---|
| Translations load, with no language file request | Pass: core's `addI18n()` registers the language, so TinyMCE 8 does not request one |
| Shared strings match TinyMCE 4 | Pass: `Fett`, `Absatz`, `Überschrift 1`, and others are identical |
| Right-to-left | Pass: `directionality: rtl`, and `dir="rtl"` on the editor document |
| `ScriptLoader.markDone` through `tinyMCEPreInit.load_ext` | Pass |
| `EditorManager.overrideDefaults`, `baseURL`, `suffix` | Pass: exists, and `baseURL` points at the plugin |

Known gaps:

- Strings that TinyMCE 8 added are not in core's translation list, so they stay in English. For example, the block format button reads `Block Absatz` in German. The full list has not been collected.
- The Classic block was not tested in another language.
- TinyMCE 8 language packs are not bundled. They are not needed for core's strings.

A 404 for the theme's `editor-style-rtl.css` appears on Hebrew sites with Twenty Twenty-Five, on both TinyMCE 4 and TinyMCE 8.

## Console errors and load order

No errors or load-order failures remain on any surface above. The problems found during Phases 1 and 2 are fixed, and each has a test:

| Problem | Fix |
|---|---|
| An empty `external_plugins` array crashed the license manager | Normalized to an object |
| `.offset().top` crashed on an empty set when a selection marker was lost | `editor.$` returns a zero position, as `DomQuery` did |
| `tinymce.ui.FloatPanel` crashed the Customizer | `tinymce.ui` is available |
| Core's sticky toolbar crashed without the v4 chrome | Its listener is unbound until the port |

No vendor files are patched, so the Phase 1 stop condition (more than two vendor patches) does not apply.

## Content corpus

`tests/fixtures/content/corpus.json` holds 112 posts in the 13 categories of Section 10.3. `v4-expected.json` is what real TinyMCE 4 stores for each one, recorded with `bun run test:corpus:record`.

On TinyMCE 8, 104 of the 112 match byte for byte. `accepted-diffs.json` lists the other 8 with their reasons:

- 2 harmless format differences, approved by the owner.
- 2 TinyMCE 4 bugs that TinyMCE 8 does not have, approved by the owner. One of them is that TinyMCE 4 deletes a link wrapped around a heading. On TinyMCE 8, an empty paragraph after that link depends on browser timing, so both forms are allowed for this one post.
- 4 Word and Google Docs paste differences, open under P5.7.
