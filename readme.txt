=== Editor Upgrade for TinyMCE ===
Contributors: mgiannopoulos24
Tags: tinymce, classic editor, editor, wysiwyg, visual editor
Requires at least: 6.5
Tested up to: 7.1.3
Requires PHP: 8.1
Stable tag: 0.1.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Replaces the TinyMCE 4 editor bundled with WordPress with TinyMCE 8.

== Description ==

WordPress still bundles TinyMCE 4.9.11 for the classic editor, the Classic block, the Text widget, and `wp_editor()`. This plugin replaces it with TinyMCE 8 and adds a compatibility layer for plugins written against the TinyMCE 4 API.

This is an early development version. WordPress's own editor features (Add Media in the toolbar, the "More" tag, the inline link and image toolbars, embed previews) are being ported and are not available yet.

Toolbar buttons that TinyMCE renamed after version 4 (`formatselect`, `styleselect`, `fontselect`, `fontsizeselect`) are mapped to their TinyMCE 8 equivalents.

== Installation ==

1. Upload the `editor-upgrade-for-tinymce` folder to the `/wp-content/plugins/` directory
2. Activate the plugin through the 'Plugins' menu in WordPress

== Changelog ==

= 0.1.0 =
* Initial development version: TinyMCE 8.10.0 replaces the bundled TinyMCE 4
* Map TinyMCE 4 toolbar buttons (`formatselect`, `styleselect`, `fontselect`, `fontsizeselect`) to their TinyMCE 8 names
* Fix the Classic block failing to load because core passes an empty `external_plugins` array
