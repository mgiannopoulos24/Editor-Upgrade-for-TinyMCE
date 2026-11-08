/**
 * Compatibility fixture: util_xhr. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_util_xhr', function ( editor ) {
	tinymce.util.XHR.send( {
		url: '/license.txt',
		success: function ( text, xhr ) {
			compatDone( 'util_xhr', { text: text.slice( 0, 9 ), status: xhr.status } );
		},
		error: function ( type ) {
			compatDone( 'util_xhr', { error: type } );
		}
	} );
} );
