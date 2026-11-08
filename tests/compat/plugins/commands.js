/**
 * Compatibility fixture: commands. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_commands', function ( editor ) {
	var state = true;

	editor.addCommand( 'compatRun', function ( ui, value ) {
		state = value;
	} );
	editor.addQueryStateHandler( 'compatRun', function () {
		return state;
	} );
	editor.addQueryValueHandler( 'compatRun', function () {
		return 'value:' + state;
	} );
	editor.on( 'init', function () {
		var before = editor.queryCommandState( 'compatRun' );

		editor.execCommand( 'compatRun', false, false );
		compatDone( 'commands', {
			before: before,
			after: editor.queryCommandState( 'compatRun' ),
			value: editor.queryCommandValue( 'compatRun' ),
			supported: editor.queryCommandSupported( 'compatRun' ),
			shortcut: editor.addShortcut( 'ctrl+alt+shift+y', 'Fixture', 'compatRun' ),
		} );
	} );
} );
