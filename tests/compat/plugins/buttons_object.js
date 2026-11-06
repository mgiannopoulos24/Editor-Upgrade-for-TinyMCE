/**
 * Compatibility fixture: buttons_object. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_buttons_object', function ( editor ) {
	editor.addButton( 'compat_buttons_object', { text: 'Fixture object' } );
	editor.on( 'init', function () {
		editor.buttons.compat_buttons_written = { text: 'Written' };

		compatDone( 'buttons_object', {
			read: editor.buttons.compat_buttons_object.text,
			written: editor.buttons.compat_buttons_written.text,
			core: !! editor.buttons.bold,
			missing: typeof editor.buttons.compat_nope,
			listed: Object.keys( editor.buttons ).indexOf( 'compat_buttons_object' ) > -1,
		} );
	} );
} );
