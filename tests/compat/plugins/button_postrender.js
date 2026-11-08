/**
 * Compatibility fixture: button_postrender. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_button_postrender', function ( editor ) {
	editor.addButton( 'compat_button_postrender', {
		text: 'Fixture render',
		onPostRender: function () {
			this.disabled( true );

			var disabled = this.disabled();

			this.disabled( false );
			this.active( true );
			compatDone( 'button_postrender', {
				disabled: disabled,
				enabledAgain: this.disabled(),
				active: this.active(),
				text: this.text(),
			} );
		}
	} );
} );
