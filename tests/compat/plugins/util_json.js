/**
 * Compatibility fixture: util_json. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_util_json', function ( editor ) {
	tinymce.util.Promise.resolve( 2 ).then( function ( value ) {
		compatDone( 'util_json', {
			promise: value,
			serialized: tinymce.util.JSON.serialize( { a: [ 1, 'x' ], b: null } ),
			parsed: tinymce.util.JSON.parse( '{"c":3}' ).c,
			invalid: typeof tinymce.util.JSON.parse( '{nope' ),
			jsonp: typeof tinymce.util.JSONP.send,
		} );
	} );
} );
