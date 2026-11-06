/**
 * Compatibility fixture: env_flags. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_env_flags', function ( editor ) {
	var env = tinymce.Env;

	compatDone( 'env_flags', {
		ie: env.ie,
		opera: env.opera,
		iOS: env.iOS,
		android: env.android,
		range: env.range,
		ceFalse: env.ceFalse,
		fileApi: env.fileApi,
		transparent: typeof env.transparentSrc,
		webkit: typeof env.webkit,
		gecko: typeof env.gecko,
		mac: typeof env.mac,
		isIE: tinymce.isIE,
		isOpera: tinymce.isOpera,
		isWebKit: typeof tinymce.isWebKit,
		isGecko: typeof tinymce.isGecko,
		isMac: typeof tinymce.isMac,
	} );
} );
