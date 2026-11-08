/**
 * Compatibility fixture: settings_object. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_settings_object', function ( editor ) {
	editor.on( 'init', function () {
		editor.settings.compat_custom = 'set';

		compatDone( 'settings_object', {
			encoding: editor.settings.entity_encoding,
			wpautop: editor.settings.wpautop,
			custom: editor.settings.compat_custom,
			missing: typeof editor.settings.compat_nope,
			getParam: editor.getParam( 'entity_encoding' ),
			getParamDefault: editor.getParam( 'compat_nope', 'fallback' ),
		} );
	} );
} );
