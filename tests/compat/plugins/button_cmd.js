/**
 * Compatibility fixture: button_cmd. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_button_cmd', function ( editor ) {
	editor.addCommand( 'compatCmd', function () {
		compatDone( 'button_cmd', { ran: true } );
	} );
	editor.addButton( 'compat_button_cmd', { text: 'Fixture cmd', cmd: 'compatCmd' } );
	compatClick( 'button_cmd', [ 'Fixture cmd' ] );
} );
