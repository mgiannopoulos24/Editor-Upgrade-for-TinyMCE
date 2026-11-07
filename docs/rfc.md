# RFC: TinyMCE 8 for the WordPress classic editor, as a plugin

**Status: draft, not published.** The owner decides where and when this is posted. It does not ask core to do anything.

## Summary

WordPress bundles TinyMCE 4.9.11, which reached end of life on 31 December 2020. It is still used by the classic editor, the Classic block, the Text widget, and every `wp_editor()` call.

Editor Upgrade for TinyMCE is a plugin that replaces it with TinyMCE 8, and includes a compatibility layer for plugins written against TinyMCE 4.

Repository: <https://github.com/mgiannopoulos24/Editor-Upgrade-for-TinyMCE>

## Why a plugin

Trac #47218 was closed as `wontfix` in June 2025. The reasons were that this is not a current priority, that default WordPress would not benefit, and that full backward compatibility is unlikely. The ticket called this "squarely in plugin territory", so that is the route this project takes.

This RFC does not ask to reopen the ticket. That only makes sense after the plugin has real users and published compatibility data.

## What it does

- Replaces the TinyMCE files WordPress loads, without patching core.
- Emulates the TinyMCE 4 API that plugins use: toolbar buttons, menu items, dialogs, settings, utilities, and TinyMCE 3 style events.
- Keeps saved post content the same as TinyMCE 4. This is tested against output recorded from real TinyMCE 4.

## What it does not do yet

- WordPress's own TinyMCE plugins are not ported, so Add Media in the toolbar, the "More" tag, the toolbar toggle, the inline link and image toolbars, embed previews, and autoresize are missing.
- It has not been tested with real third-party plugins, only with fixture plugins written for this project.
- Pasting from Word no longer cleans up the markup, because TinyMCE moved that filter to a commercial product.
- The default set of files is larger than with TinyMCE 4, and over this project's budget.

It is not ready for production sites.

## Non-goals

Replacing TinyMCE with another editor, removing the classic editor, or changing the block editor.

## Help wanted

- Plugin authors: try your plugin, using the [migration guide](../MIGRATION.md), and report what breaks.
- Anyone with accessibility or security experience: reviews are needed before this could be considered complete.
- Anyone with real Safari, iOS, or Firefox ESR setups: testing on these is still open.

## License

GPLv2 or later, the same as WordPress and TinyMCE 8's open source license, so the code stays eligible for core.
