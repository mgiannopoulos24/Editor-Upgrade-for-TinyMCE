/**
 * Compatibility fixture: button_state. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_button_state', function ( editor ) {
	var control;

	editor.addButton( 'compat_button_state', {
		text: 'Fixture state',
		stateSelector: 'strong',
		onPostRender: function () {
			control = this;
		}
	} );
	editor.on( 'init', function () {
		setTimeout( function () {
			var result = {};

			editor.setContent( '<p><strong>x</strong></p>' );
			editor.selection.select( editor.dom.select( 'strong' )[ 0 ] );
			editor.nodeChanged();
			result.inStrong = control.active();
			editor.setContent( '<p>y</p>' );
			editor.selection.select( editor.dom.select( 'p' )[ 0 ] );
			editor.nodeChanged();
			result.outside = control.active();
			compatDone( 'button_state', result );
		}, 50 );
	} );
} );
