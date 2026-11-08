/**
 * Compatibility fixture: button_onclick. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_button_onclick', function ( editor ) {
	editor.addButton( 'compat_button_onclick', {
		text: 'Fixture onclick',
		onclick: function ( event ) {
			compatDone( 'button_onclick', {
				thisHasActive: typeof this.active === 'function',
				eventControlIsThis: event.control === this,
				settingsText: this.settings.text,
			} );
		}
	} );
	compatClick( 'button_onclick', [ 'Fixture onclick' ] );
} );
