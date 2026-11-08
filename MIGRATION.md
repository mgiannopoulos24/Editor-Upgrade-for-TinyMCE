# Migrating a plugin to TinyMCE 8

For authors of WordPress plugins that add to the classic editor. This guide applies to Editor Upgrade for TinyMCE 0.1.0, which bundles TinyMCE 8.10.

## The short version

1. **Your plugin may already work.** The plugin's compatibility layer, `compat4x`, keeps most of the TinyMCE 4 API running on TinyMCE 8.
2. **Test it** with `SCRIPT_DEBUG` on. Anything that needs your attention logs a message in the browser console.
3. **Keep supporting TinyMCE 4.** WordPress itself still ships TinyMCE 4, so most of your users will not have TinyMCE 8. See [Support both versions](#support-both-versions).

## Test your plugin

1. Install Editor Upgrade for TinyMCE on a test site, along with the Classic Editor plugin if you need `post.php` to use TinyMCE.
2. Add `define( 'SCRIPT_DEBUG', true );` to `wp-config.php`.
3. Open each screen where your plugin adds to the editor, and use each feature.
4. Look in the browser console for messages that start with `[Editor Upgrade for TinyMCE]`. Each one appears once per page.

For example:

```text
[Editor Upgrade for TinyMCE] editor.addButton() is deprecated; use editor.ui.registry.addButton().
[Editor Upgrade for TinyMCE] Toolbar item "my_button" is not registered, so TinyMCE 8 does not show it.
```

Production pages do not log these messages. WordPress's own code triggers some of them, such as the `addButton()` notice, so check that a message comes from your plugin before acting on it.

## What still works

| Your plugin uses | On TinyMCE 8 | What to do |
|---|---|---|
| `editor.addButton()`, including `menubutton`, `listbox`, `splitbutton` | Works, deprecated | [Use the registry](#toolbar-buttons) |
| `editor.addMenuItem()`, including `context` | Works, deprecated | [Use the registry](#menu-items) |
| `editor.buttons`, `editor.menuItems` | Works, deprecated | Use `editor.ui.registry.getAll()` |
| `editor.windowManager.open()` with `body`, `buttons`, `onsubmit`, or `url` | Works, deprecated | [Use the dialog format](#dialogs) |
| `getParams()`, `setParams()`, `getWindows()` on the window manager | Works, deprecated | Keep your data in a closure |
| `editor.settings` | Works, deprecated | [Use `editor.options`](#settings) |
| `tinymce.$`, `editor.$`, `editor.dom.$` | Works, backed by jQuery | Use `editor.dom` or jQuery directly |
| `tinymce.Env.ie`, `iOS`, `mac`, `webkit`, `gecko` | Works, deprecated | [Use the new helpers](#browser-checks) |
| `tinymce.isIE`, `isWebKit`, `isGecko`, `isMac`, `isOpera` | Works, deprecated | [Use the new helpers](#browser-checks) |
| `tinymce.editors` | Works, deprecated | Use `tinymce.get()` |
| `tinymce.create()`, `tinymce.createNS()`, `tinymce.util.Class` | Works, deprecated | Use plain functions |
| `tinymce.util.XHR`, `JSONRequest`, `JSONP` | Works, deprecated | Use `fetch()` |
| `tinymce.util.Promise`, `tinymce.util.JSON` | Works, deprecated | Use `Promise` and `JSON` |
| `tinymce.util.Delay.setTimeout`, `debounce`, and similar | Works, deprecated | Use `setTimeout()`, or `setEditorTimeout()` |
| `tinymce.html.SaxParser` | Works, deprecated | Use `tinymce.html.DomParser` |
| `editor.onInit.add()` and other TinyMCE 3 events | Works, deprecated | [Use `editor.on()`](#events) |
| `editor.addContextToolbar()` | Works, deprecated | Use `editor.ui.registry.addContextToolbar()` |
| `editor.addSidebar()` | Works, not tested visually | Use `editor.ui.registry.addSidebar()` |
| `editor.setMode()` | Works, deprecated | Use `editor.mode.set()` |
| `formatselect`, `styleselect`, `fontselect`, `fontsizeselect` in a toolbar | Renamed for you | Use `blocks`, `styles`, `fontfamily`, `fontsize` |
| Commas between toolbar items | Converted for you | Use spaces |
| `font_formats`, `fontsize_formats` | Renamed for you | Use `font_family_formats`, `font_size_formats` |
| `textcolor_map`, `forecolor_map`, `backcolor_map`, and their `_cols` settings | Renamed for you | Use `color_map`, `color_map_foreground`, `color_map_background`, and `color_cols` |
| `target_list`, `rel_list`, `default_link_target` | Renamed for you | Use `link_target_list`, `link_rel_list`, `link_default_target` |

These parts of the API are unchanged, so no work is needed: `editor.on()`, `editor.addCommand()`, `editor.addShortcut()`, `editor.dom`, `editor.formatter`, `editor.selection`, `editor.undoManager`, `editor.notificationManager`, `tinymce.PluginManager.add()`, and the `tiny_mce_before_init`, `mce_external_plugins`, and `mce_buttons` filters.

## What needs changing

These have no TinyMCE 8 equivalent. They log a message, then do nothing or return `undefined`.

| Your plugin uses | What happens | What to do |
|---|---|---|
| Custom `tinymce.ui` controls, such as `tinymce.ui.Control.extend()` | The class works, but never renders | Use a registry button, a dialog, or your own DOM |
| `new tinymce.ui.Window()`, and other controls you render yourself | Nothing appears | Use `editor.windowManager.open()` |
| `createControl()` on a plugin | Never called | Add the button in your plugin's `init` |
| `editor.controlManager.createButton()` and similar | Returns an inert object | Use the registry |
| `editor.theme.panel` | `undefined` | Use a context toolbar or a dialog |
| `tinymce.util.Color` | `undefined` | Use your own helper |
| `tinymce.WPWindowManager`, `tinymce.InlineWindowManager` | `undefined` | Use `editor.windowManager` |
| Dependencies in `PluginManager.add( name, plugin, dependencies )` | Not loaded | Load them with `mce_external_plugins` |
| `color_picker_callback`, `toolbar_items_size`, `insert_button_items`, `*_rows` color settings | Ignored | Remove them |

### Behavior that differs without a message

- **CSS for the editor chrome.** TinyMCE 8 uses `.tox-*` classes. The plugin adds `.mce-tinymce`, `.mce-toolbar-grp`, `.mce-edit-area`, `.mce-statusbar`, `.mce-menubar`, `.mce-menu`, `.mce-window`, and `.mce-floatpanel` so selectors still match, but the DOM inside them is different.
- **No `.mce-btn`, `.mce-btn-group`, or `.mce-toolbar`.** Adding these would restyle every toolbar button through WordPress's own CSS. Rules that use them no longer match.
- **Icons set by CSS.** `icon: 'my-icon'` still renders `<i class="mce-ico mce-i-my-icon">`. If your CSS sets `font-family` on that element, TinyMCE's reset overrides it, so set the font on the `::before` pseudo-element, or [register an SVG icon](#toolbar-buttons).
- **Dialog size.** TinyMCE 8 dialogs size to their content. `width` picks the `normal`, `medium`, or `large` size, and `height` is ignored except in URL dialogs. This one logs a message.
- **Dialog `$el`.** `win.$el` is the TinyMCE 8 dialog, so it has no `.mce-*` elements inside.
- **`forced_root_block: false`.** TinyMCE 8 requires a root block, so this becomes `p`. This one logs a message.
- **Read-only mode.** `contentEditable` stays `true`, and TinyMCE blocks input instead. Use `editor.mode.isReadOnly()` to check it.

- **Pasting from Word and Google Docs.** TinyMCE 4 cleaned up Word markup and turned fake bullets into lists. That filter is now part of TinyMCE's commercial PowerPaste, so `class="MsoNormal"` stays, and fake bullets stay as text.
- **Removed paste settings.** `paste_word_valid_elements`, `paste_retain_style_properties`, `paste_convert_word_fake_lists`, `paste_enable_default_filters`, and `paste_filter_drop` have no effect. TinyMCE 8 logs these itself.

### Plugins that TinyMCE 8 no longer has

`colorpicker`, `contextmenu`, `hr`, `noneditable`, `paste`, `print`, `tabfocus`, `textcolor`, and `textpattern` are part of TinyMCE 8 now. The plugin skips those names quietly, and `editor.plugins.paste` is `undefined`, so check for it before you use it.

`fullpage`, `imagetools`, `spellchecker`, `template`, and `toc` are gone or commercial. The plugin skips them and logs a message.

### Saved content

Your plugin's content is saved in the same format as on TinyMCE 4, including `<br />`, `<!--more-->`, shortcodes, `<script>`, and iframes. This is checked against output recorded from TinyMCE 4.

To do this, the plugin sets these TinyMCE 8 options back to their TinyMCE 4 behavior when they are not already set:

| Option | Value | TinyMCE 8 default |
|---|---|---|
| `element_format` | `xhtml` | `html` |
| `sandbox_iframes` | `false` | `true` |
| `convert_unsafe_embeds` | `false` | `true` |
| `allow_html_in_comments` | `true` | `false` |
| `paste_data_images` | `false` | `true` |

A site can choose the TinyMCE 8 behavior through `tiny_mce_before_init`.

## Support both versions

WordPress ships TinyMCE 4 unless a site runs this plugin, so branch on the version. Do not check for `editor.ui`, because this tells you nothing about the version your code is written for.

```js
var isModern = parseInt( tinymce.majorVersion, 10 ) >= 6;

function insertGreeting() {
	editor.insertContent( 'Hello' );
}

if ( isModern ) {
	editor.ui.registry.addButton( 'my_both', {
		text: 'Greet',
		onAction: insertGreeting
	} );
} else {
	editor.addButton( 'my_both', {
		text: 'Greet',
		onclick: insertGreeting
	} );
}
```

If you are not ready to do this, keep your TinyMCE 4 code. It keeps working through `compat4x`, and you can move later.

## Common changes

Every example runs in a test against TinyMCE 8, and `editor` is the argument your plugin receives.

### Toolbar buttons

TinyMCE 4:

```js v4
editor.addButton( 'my_button', {
	text: 'Greet',
	tooltip: 'Insert a greeting',
	onclick: function () {
		editor.insertContent( 'Hello' );
	}
} );
```

TinyMCE 8:

```js
editor.ui.registry.addIcon( 'my-icon', '<svg width="24" height="24"><path d="M4 4h16v16H4z"></path></svg>' );

editor.ui.registry.addButton( 'my_button', {
	text: 'Greet',
	icon: 'my-icon',
	tooltip: 'Insert a greeting',
	onAction: function () {
		editor.insertContent( 'Hello' );
	}
} );
```

Register buttons before the toolbar renders, in your plugin's `init` or in `setup`.

### Buttons with state

TinyMCE 4:

```js v4
editor.addButton( 'my_state', {
	text: 'Strong',
	stateSelector: 'strong',
	onclick: function () {
		editor.execCommand( 'Bold' );
	}
} );
```

TinyMCE 8 uses a toggle button. `onSetup` returns a function that removes the listener:

```js
editor.ui.registry.addToggleButton( 'my_state', {
	text: 'Strong',
	onAction: function () {
		editor.execCommand( 'Bold' );
	},
	onSetup: function ( api ) {
		function update( event ) {
			api.setActive( editor.dom.getParents( event.element, 'strong', editor.getBody() ).length > 0 );
		}

		editor.on( 'NodeChange', update );

		return function () {
			editor.off( 'NodeChange', update );
		};
	}
} );
```

### Menu buttons

TinyMCE 4:

```js v4
editor.addButton( 'my_menu', {
	type: 'menubutton',
	text: 'Insert',
	menu: [
		{ text: 'Greeting', onclick: function () {
			editor.insertContent( 'Hello' );
		} }
	]
} );
```

TinyMCE 8 builds the items when the menu opens:

```js
editor.ui.registry.addMenuButton( 'my_menu', {
	text: 'Insert',
	fetch: function ( callback ) {
		callback( [
			{
				type: 'menuitem',
				text: 'Greeting',
				onAction: function () {
					editor.insertContent( 'Hello' );
				}
			}
		] );
	}
} );
```

### Menu items

TinyMCE 4 added an item to the menu named in `context`:

```js v4
editor.addMenuItem( 'my_item', {
	text: 'Greeting',
	context: 'tools',
	onclick: function () {
		editor.insertContent( 'Hello' );
	}
} );
```

TinyMCE 8 registers the item, and the site lists it in the `menu` setting:

```js
editor.ui.registry.addMenuItem( 'my_item', {
	text: 'Greeting',
	onAction: function () {
		editor.insertContent( 'Hello' );
	}
} );
```

### Dialogs

TinyMCE 4:

```js v4
editor.addCommand( 'myOpenOldDialog', function () {
	editor.windowManager.open( {
		title: 'Greeting',
		data: { name: 'World' },
		body: [
			{ type: 'textbox', name: 'name', label: 'Name' }
		],
		onsubmit: function ( event ) {
			editor.insertContent( 'Hello ' + event.data.name );
		}
	} );
} );
```

TinyMCE 8 describes the dialog as data. You close it yourself in `onSubmit`:

```js
editor.addCommand( 'myOpenDialog', function () {
	editor.windowManager.open( {
		title: 'Greeting',
		initialData: { name: 'World' },
		body: {
			type: 'panel',
			items: [
				{ type: 'input', name: 'name', label: 'Name' }
			]
		},
		buttons: [
			{ type: 'cancel', text: 'Cancel' },
			{ type: 'submit', text: 'Insert', buttonType: 'primary' }
		],
		onSubmit: function ( api ) {
			editor.insertContent( 'Hello ' + api.getData().name );
			api.close();
		}
	} );
} );
```

| TinyMCE 4 field | TinyMCE 8 field |
|---|---|
| `textbox` | `input` |
| `textbox` with `multiline: true` | `textarea` |
| `listbox` with `values` | `listbox` with `items`, and string values only |
| `checkbox` with `text` | `checkbox` with `label` |
| `colorbox` | `colorinput` |
| `filepicker` | `urlinput`, and its value is an object |
| `container` with `html`, or `label` | `htmlpanel` |

### Settings

TinyMCE 4:

```js v4
var greeting = editor.settings.my_greeting || 'Hello';

editor.on( 'init', function () {
	editor.getBody().setAttribute( 'data-greeting', greeting );
} );
```

TinyMCE 8 needs an option to be registered before it can be read:

```js
editor.options.register( 'my_greeting', {
	processor: 'string',
	default: 'Hello'
} );

editor.on( 'init', function () {
	editor.getBody().setAttribute( 'data-greeting', editor.options.get( 'my_greeting' ) );
} );
```

### Events

TinyMCE 3 events pass the editor and positional arguments:

```js v4
editor.onInit.add( function ( ed ) {
	ed.getBody().setAttribute( 'data-ready', '1' );
} );
```

`editor.on()` passes one event object, on every version since TinyMCE 4:

```js
editor.on( 'init', function () {
	editor.getBody().setAttribute( 'data-ready', '1' );
} );
```

On stock TinyMCE 8, changes to `event.content` in a `SaveContent` handler are ignored. The plugin restores them, but this works everywhere from TinyMCE 4 on:

```js
editor.on( 'GetContent', function ( event ) {
	if ( event.save ) {
		event.content += '<!-- saved -->';
	}
} );
```

### Browser checks

Most of these checks can be deleted, because TinyMCE 8 does not run on Internet Explorer.

```js
var isApple = tinymce.Env.os.isMacOS() || tinymce.Env.os.isiOS();
var isSafari = tinymce.Env.browser.isSafari();

editor.on( 'init', function () {
	editor.getBody().setAttribute( 'data-apple', String( isApple && isSafari ) );
} );
```

### Requests

```js
editor.addCommand( 'myFetch', function () {
	return fetch( '/license.txt' ).then( function ( response ) {
		return response.text();
	} );
} );
```

## More help

- The fixture plugins in `tests/compat/plugins/` are small, working examples of the TinyMCE 4 API.
- TinyMCE's own guide: <https://www.tiny.cloud/docs/tinymce/8/migration-from-4x/>.
