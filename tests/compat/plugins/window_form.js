/**
 * Compatibility fixture: window_form. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_window_form', function ( editor ) {
	editor.on( 'init', function () {
		var submitted;
		var win = editor.windowManager.open( {
			title: 'Fixture form',
			data: { a: 'from data' },
			body: [
				{ type: 'textbox', name: 'a', label: 'A' },
				{ type: 'listbox', name: 'b', label: 'B', values: [ { text: 'One', value: 1 } ] },
				{ type: 'checkbox', name: 'c', text: 'C', checked: true },
			],
			onsubmit: function ( event ) {
				submitted = event.data;
			}
		}, { param: 1 } );
		var before = win.toJSON();
		var params = editor.windowManager.getParams();

		win.find( '#a' ).value( 'changed' );
		win.submit();
		compatDone( 'window_form', {
			before: before,
			params: params,
			submitted: submitted,
			open: editor.windowManager.getWindows().length,
		} );
	} );
} );
