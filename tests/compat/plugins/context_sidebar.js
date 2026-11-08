/**
 * Compatibility fixture: context_sidebar. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_context_sidebar', function ( editor ) {
	var shown = {};

	editor.addButton( 'compat_context_button', { text: 'Fixture context' } );
	editor.addContextToolbar( 'strong', 'compat_context_button' );
	editor.addContextToolbar( function ( element ) {
		shown.predicate = !! element;
		return false;
	}, [ 'bold' ] );
	editor.addSidebar( 'compat_sidebar', {
		tooltip: 'Fixture sidebar',
		icon: 'bold',
		onrender: function () {
			shown.rendered = true;
		}
	} );
	editor.on( 'init', function () {
		// Firefox cannot focus the iframe during the init event.
		setTimeout( function () {
			editor.focus();
			editor.setContent( '<p><strong>x</strong></p>' );
			editor.selection.select( editor.dom.select( 'strong' )[ 0 ] );
			editor.nodeChanged();
			setTimeout( function () {
				compatDone( 'context_sidebar', { predicate: shown.predicate } );
			}, 500 );
		}, 100 );
	} );
} );
