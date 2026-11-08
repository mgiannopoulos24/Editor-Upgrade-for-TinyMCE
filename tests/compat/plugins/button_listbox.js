/**
 * Compatibility fixture: button_listbox. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_button_listbox', function ( editor ) {
	editor.addButton( 'compat_button_listbox', {
		type: 'listbox',
		text: 'Fixture list',
		values: [ { text: 'Fixture alpha', value: 1 }, { text: 'Fixture beta', value: 'b' } ],
		onselect: function () {
			compatDone( 'button_listbox', { value: this.value(), hasControl: typeof this.text === 'function' } );
		}
	} );
	compatClick( 'button_listbox', [ 'Fixture list', 'Fixture alpha' ] );
} );
