/**
 * Compatibility fixture: window_url. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_window_url', function ( editor ) {
	editor.on( 'init', function () {
		var closed = false;
		var win = editor.windowManager.open( {
			title: 'Fixture URL',
			url: '/license.txt',
			width: 300,
			height: 200,
			onclose: function () {
				closed = true;
			}
		}, { from: 'fixture' } );
		var params = editor.windowManager.getParams();
		var open = editor.windowManager.getWindows().length;

		win.close();
		compatDone( 'window_url', {
			params: params,
			openWhileShown: open,
			closed: closed,
			openAfter: editor.windowManager.getWindows().length,
			alert: typeof editor.windowManager.alert,
			confirm: typeof editor.windowManager.confirm,
		} );
	} );
} );
