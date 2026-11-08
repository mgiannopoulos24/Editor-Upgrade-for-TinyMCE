/**
 * Compatibility fixture: legacy_api. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_legacy_api', function ( editor ) {
	var version = {};

	editor.settings.compat_callback = function ( value ) {
		return 'called:' + value;
	};

	editor.on( 'init', function () {
		var delay = tinymce.util.Delay;
		var schema = tinymce.html.Schema();
		var result = {
			getLang: editor.getLang( 'compat.nope', 'fallback' ),
			rtl: typeof editor.rtl,
			execCallback: editor.execCallback( 'compat_callback', 'x' ),
			execMissing: typeof editor.execCallback( 'compat_nope' ),
			baseUrl: typeof editor.documentBaseUrl,
			domDollar: typeof editor.dom.$,
			domDollars: typeof editor.dom.$$,
			globalDollar: typeof tinymce.DOM.$,
			toHex: editor.dom.toHex( 'rgb(255, 0, 16)' ),
			shortEnded: !! schema.getShortEndedElements().br,
			whiteSpace: !! schema.getWhiteSpaceElements().pre,
			editorShortEnded: !! editor.schema.getShortEndedElements().hr,
			delay: [ 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame', 'debounce', 'throttle' ].map( function ( name ) {
				return typeof delay[ name ];
			} ),
			toolsCreate: typeof tinymce.util.Tools.create,
			toolsCreateNS: typeof tinymce.util.Tools.createNS,
			i18nRtl: typeof tinymce.util.I18n.rtl,
			settings: typeof tinymce.settings,
			defaultSettings: typeof tinymce.defaultSettings,
			dependencies: tinymce.PluginManager.dependencies( 'compat_legacy_api' ).length,
			addComponents: typeof tinymce.PluginManager.addComponents,
			windows: Array.isArray( editor.windowManager.windows ),
			managerEditor: editor.windowManager.editor === editor,
			resizeBy: typeof editor.theme.resizeBy,
		};

		editor.setMode( 'readonly' );
		result.readonly = editor.readonly;
		editor.setMode( 'design' );
		result.design = editor.readonly;

		delay.setTimeout( function () {
			var debounced = delay.debounce( function ( value ) {
				version.debounced = value;
				result.debounced = version.debounced;
				compatDone( 'legacy_api', result );
			}, 10 );

			result.stop = typeof debounced.stop;
			debounced( 1 );
			debounced( 2 );
		}, 1 );
	} );
} );
