/**
 * Compatibility fixture: editors_list. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_editors_list', function ( editor ) {
	editor.on( 'init', function () {
		compatDone( 'editors_list', {
			first: tinymce.editors[ 0 ].id,
			keyed: tinymce.editors.content.id,
			isArrayLike: typeof tinymce.editors.length,
			get: tinymce.get( 'content' ) === editor,
			active: tinymce.activeEditor === editor,
			util: typeof tinymce.EditorManager.get,
		} );
	} );
} );
