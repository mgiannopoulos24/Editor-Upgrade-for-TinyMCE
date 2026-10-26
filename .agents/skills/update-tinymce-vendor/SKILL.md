---
name: update-tinymce-vendor
description: Use when bumping the vendored TinyMCE version in assets/vendor/tinymce (new 8.x release, security fix) or when the CI checksum job fails.
---

# Updating the vendored TinyMCE

## Procedure

1. Check the release: the TinyMCE changelog (`npm pack tinymce@<version>` and read
   `CHANGELOG.md` in the tarball) for removed APIs, option changes, and security fixes. Stay on
   8.x; a new major is a separate project.
2. Run `bun run tinymce:update <version>`. It replaces `assets/vendor/tinymce/`, writes
   `assets/vendor/tinymce/VERSION`, and regenerates `assets/vendor/tinymce.sha256`.
3. Review the vendor diff (`git diff --stat assets/vendor/`); look closely at
   `tinymce.js`, `themes/silver/`, `models/dom/`, and the license-key code.
4. Re-check the assumptions the plugin depends on, by grepping the new `tinymce.js`:
   - license rules: search `PROVIDE_LICENSE_KEY_MESSAGE` and `getLicenseKeyType`; `'gpl'`
     without `api_key` must still run offline;
   - `editor.fire`, `editor.getParam`, `AddEditor` event, `options.register` processor contract;
   - the plugin directory list (new or removed plugins change what `filter_plugins()` keeps).
5. Confirm `license.md` is still GPLv2-or-later (dual-licensed). If not, stop and ask the owner.
6. Run the `test-editor-surfaces` checks.
7. Add a CHANGELOG entry ("Updated TinyMCE to x.y.z") and update `docs/plan.md` Appendix A.4
   if the pinned version is mentioned.

## CI checksum failure

The `vendor` job runs `sha256sum --check` against `assets/vendor/tinymce.sha256`. Never edit
vendored files by hand; patches go in `compat4x.js` or a ported plugin. If the check fails,
re-run step 2 with the version in `assets/vendor/tinymce/VERSION`.
