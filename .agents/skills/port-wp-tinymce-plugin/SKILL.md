---
name: port-wp-tinymce-plugin
description: Use when porting one of WordPress core's TinyMCE 4 plugins (wordpress, wplink, wpeditimage, wpview, wptextpattern, wpautoresize, wpdialogs, wpgallery, wpemoji) to the TinyMCE 8 API inside this plugin.
---

# Porting a WordPress TinyMCE plugin to v8

Core's v4 plugins live in
`../wordpress-develop/src/js/_enqueues/vendor/tinymce/plugins/<name>/plugin.js`.
Until a plugin is ported, `Editor_Upgrade_For_TinyMCE_Settings::filter_plugins()` and
`compat4x.js` drop it from the plugin list because it does not exist in
`assets/vendor/tinymce/plugins/`.

Recommended order (easiest first): `wpemoji`, `wpgallery`, `wpview`, `wptextpattern`,
`wpautoresize`, `wpeditimage`, `wplink`, `wordpress`. `wpdialogs` is not ported (see
`docs/plan.md` Section 7.6.3).

## Procedure

1. **Read the plan entry.** `docs/plan.md` Section 4.5 (APIs each plugin uses), Section 7.6–7.7
   (design for links, images, views, text patterns, autoresize), Appendix B (API mapping),
   Appendix C (button and icon names).
2. **Copy, don't rewrite from scratch.** Copy the v4 source to
   `assets/js/plugins/<name>/plugin.js` and port it in place, so the diff against core stays
   reviewable. Keep the plugin name, `data-wp-*`/`data-wpview-*` attributes, shortcodes, and
   saved HTML identical: they are a public contract and must round-trip byte-for-byte.
3. **Common replacements:**
   | v4 | v8 |
   |---|---|
   | `editor.addButton( name, { onclick, cmd, icon } )` | `editor.ui.registry.addButton( name, { onAction, icon, tooltip } )`; `cmd` becomes `onAction: () => editor.execCommand( cmd )`; `onPostRender` becomes `onSetup` returning a teardown function |
   | `editor.addMenuItem()` | `editor.ui.registry.addMenuItem()` |
   | `editor.settings.x` | `editor.options.register( 'x', { processor: … } )` once, then `editor.options.get( 'x' )` |
   | `editor.fire()` | `editor.dispatch()` |
   | `tinymce.$`, `editor.$` | `editor.dom` (DOMUtils) or jQuery; never rely on the compat4x shim in ported code |
   | `tinymce.Env.ie` / `iOS` | remove / `tinymce.Env.os.isiOS()` |
   | `tinymce.ui.Factory`, custom floating toolbars, `editor.fire( 'wptoolbar' )` | `editor.ui.registry.addContextToolbar()` / `addContextForm()` |
   | `editor.windowManager.open()` v4 schema | v8 dialog `{ title, body: { type: 'panel', items }, buttons, onSubmit }` |
4. **Register it.** Add the plugin through the `mce_external_plugins` filter (URL to
   `assets/js/plugins/<name>/plugin.js`) instead of the internal plugin list, and remove
   the name from the dropped list if one exists.
5. **Toolbar buttons:** map v4 button names to the registered v8 names on the
   `mce_buttons*` filters only when the name changed; keep WordPress names (`wp_more`,
   `wp_adv`, …) unchanged.
6. **Run `bun run lint`** for any PHP touched and `node --check` on the ported file.

## Verify

Use the `test-editor-surfaces` skill. For every plugin, at minimum: the feature works in the
classic editor and the Classic block, the saved post HTML is unchanged compared with core's v4
editor for the same action, and the console is clean.
