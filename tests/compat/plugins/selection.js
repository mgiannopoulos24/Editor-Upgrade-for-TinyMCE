/**
 * Compatibility fixture: selection. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_selection', function ( editor ) {
	editor.on( 'init', function () {
		editor.setContent( '<p>abc</p>' );
		editor.selection.select( editor.dom.select( 'p' )[ 0 ] );

		var text = editor.selection.getContent( { format: 'text' } );
		var bookmark = editor.selection.getBookmark();

		editor.selection.moveToBookmark( bookmark );
		editor.selection.setContent( '<em>new</em>' );
		compatDone( 'selection', {
			text: text,
			bookmark: typeof bookmark,
			node: editor.selection.getNode().nodeName,
			content: editor.getContent(),
			insert: typeof editor.insertContent,
		} );
	} );
} );
