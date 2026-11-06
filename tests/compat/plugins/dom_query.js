/**
 * Compatibility fixture: dom_query. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_dom_query', function ( editor ) {
	editor.on( 'init', function () {
		editor.setContent( '<p class="a">x</p><p>y</p>' );

		var paragraphs = editor.$( 'p' );

		paragraphs.first().addClass( 'b' );
		compatDone( 'dom_query', {
			count: paragraphs.length,
			firstClass: paragraphs.first().attr( 'class' ),
			text: paragraphs.last().text(),
			global: typeof tinymce.$,
			globalCount: tinymce.$( '#content' ).length,
		} );
	} );
} );
