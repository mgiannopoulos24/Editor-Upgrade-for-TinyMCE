/**
 * Compatibility fixture: json_request. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_json_request', function ( editor ) {
	tinymce.util.JSONRequest.sendRPC( {
		url: '/license.txt',
		method: 'fixture',
		params: [],
		success: function () {
			compatDone( 'json_request', { success: true } );
		},
		error: function ( message, xhr ) {
			compatDone( 'json_request', { error: message, hasXhr: !! xhr } );
		}
	} );
} );
