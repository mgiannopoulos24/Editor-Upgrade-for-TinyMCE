/**
 * Compatibility fixture: wp_events. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_wp_events', function ( editor ) {
	var fired = null;

	jQuery( document ).on( 'tinymce-editor-init.compat', function ( event, target ) {
		fired = target === editor;
	} );
	editor.on( 'init', function () {
		setTimeout( function () {
			compatDone( 'wp_events', {
				editorInit: fired,
				wpEditor: typeof wp.editor.removep,
				activeEditor: window.wpActiveEditor,
				preInit: typeof tinyMCEPreInit.mceInit.content,
			} );
		}, 200 );
	} );
} );
