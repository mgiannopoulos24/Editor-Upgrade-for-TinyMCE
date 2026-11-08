/**
 * Compatibility fixture: button_split. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_button_split', function ( editor ) {
	editor.addButton( 'compat_button_split', {
		type: 'splitbutton',
		text: 'Fixture split',
		onclick: function () {},
		menu: [ { text: 'Fixture other' } ]
	} );
	editor.on( 'init', function () {
		compatDone( 'button_split', {
			type: editor.buttons.compat_button_split.type,
			menuSize: editor.buttons.compat_button_split.menu.length,
		} );
	} );
} );
