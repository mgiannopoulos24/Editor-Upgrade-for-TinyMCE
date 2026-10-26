---
name: compat4x-shim
description: Use when a TinyMCE 4 API used by WordPress core or a third-party plugin throws or misbehaves on TinyMCE 8 (e.g. "x is not a function", "cannot read properties of undefined"), and it should be emulated in assets/js/compat4x.js instead of patching core.
---

# Adding a compat4x shim

`assets/js/compat4x.js` is loaded as core's `wp-tinymce` handle, directly after TinyMCE 8.
Core code (`wp/editor/base.js`, `WP_Editor::editor_js()`, `mce-view.js`, `dfw.js`) and
third-party plugins still call TinyMCE 4 APIs. We cannot change core, so every v4 API they
rely on is emulated here.

## Procedure

1. **Find the real caller.** Map the stack trace to the source in
   `../wordpress-develop/src/js/_enqueues/` (the browser serves the built `editor.js`,
   `mce-view.js` etc.; line numbers differ). Read the surrounding code to see which methods
   of the returned object are used next. The shim must cover the whole call path, not just
   the first throw (e.g. Visual ↔ Code uses `editor.$`, `editor.settings`, and
   `editor.theme.resizeTo` in sequence).
2. **Check what v8 really has.** Grep `assets/vendor/tinymce/tinymce.js` (and
   `themes/silver/theme.js`). Do not trust docs pages. Some v4 APIs still exist in v8:
   `editor.fire()` (alias of `dispatch()`), `editor.getParam()`,
   `tinymce.get()`. Do not shim these.
3. **Pick the scope:**
   - global (`tinymce.$`, `tinymce.editors`): top level of the IIFE, guarded with `if ( ! … )`;
   - per editor (`editor.$`, `editor.settings`, `editor.addButton`): a `shimX( editor )`
     function called from the `AddEditor` listener; if it needs the rendered UI, register it
     on `editor.on( 'init' )` inside that function.
4. **Never overwrite an existing property.** If v8 or another plugin already defines it,
   leave it alone.
5. **Match v4 semantics, not the name.** E.g. `editor.$` was scoped to the iframe
   document, so the shim passes `editor.getDoc()` as the jQuery context.
6. **Deprecation notices:** for APIs third-party plugins call directly (`addButton`,
   `addMenuItem`, `windowManager.open` with a v4 schema), log once per API name through
   `warn()` (only shown with `SCRIPT_DEBUG`). Core's own internal calls should not spam the
   console.
7. **Record it:** add a row to the shim table in `docs/plan.md` Section 7.4 if it is missing,
   and a CHANGELOG entry.

## Verify

- `node --check assets/js/compat4x.js`.
- Reproduce the original action in wp-env (see the `test-editor-surfaces` skill) and confirm
  the console is clean for that action and the ones after it.

## Out of scope

Custom `tinymce.ui.*` controls (`Factory`, `Control.extend`, `FloatPanel`) cannot be shimmed
meaningfully. WordPress's own plugins that use them get a native port (see the
`port-wp-tinymce-plugin` skill); third-party ones are documented as unsupported.
