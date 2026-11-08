/**
 * Compatibility fixture: theme_ui. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_theme_ui', function ( editor ) {
	editor.on( 'init', function () {
		var message = editor.notificationManager.open( { text: 'Fixture', type: 'info' } );
		var open = editor.notificationManager.getNotifications().length;

		message.close();
		compatDone( 'theme_ui', {
			resizeTo: typeof editor.theme.resizeTo,
			notification: open,
			closed: editor.notificationManager.getNotifications().length,
			container: !! editor.getContainer(),
			area: !! editor.getContentAreaContainer(),
			doc: !! editor.getDoc(),
			win: !! editor.getWin(),
			body: editor.getBody().nodeName,
		} );
	} );
} );
