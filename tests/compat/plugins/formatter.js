/**
 * Compatibility fixture: formatter. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_formatter', function ( editor ) {
	editor.on( 'init', function () {
		editor.formatter.register( 'compatFormat', { inline: 'span', classes: 'compat' } );
		editor.setContent( '<p>x</p>' );
		editor.selection.select( editor.dom.select( 'p' )[ 0 ].firstChild );
		editor.formatter.apply( 'compatFormat' );

		var applied = editor.getContent();
		var matched = editor.formatter.match( 'compatFormat' );

		editor.formatter.remove( 'compatFormat' );
		compatDone( 'formatter', { applied: applied, matched: matched, removed: editor.getContent() } );
	} );
} );
