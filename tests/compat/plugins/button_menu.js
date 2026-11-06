/**
 * Compatibility fixture: button_menu. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_button_menu', function ( editor ) {
	editor.addButton( 'compat_button_menu', {
		type: 'menubutton',
		text: 'Fixture menu',
		icon: false,
		menu: [
			{ text: 'Fixture first', onclick: function () {
				compatDone( 'button_menu', { clicked: 'first', menuSize: editor.buttons.compat_button_menu.menu.length } );
			} },
			{ text: 'Fixture second' }
		]
	} );
	compatClick( 'button_menu', [ 'Fixture menu', 'Fixture first' ] );
} );
