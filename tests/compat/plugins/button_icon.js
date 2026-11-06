/**
 * Compatibility fixture: button_icon. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_button_icon', function ( editor ) {
	var button = { tooltip: 'Fixture icon' };

	editor.addButton( 'compat_button_icon', button );
	editor.addButton( 'compat_button_image', { tooltip: 'Fixture image', image: '/wp-includes/images/w-logo-blue.png' } );
	editor.on( 'init', function () {
		compatDone( 'button_icon', {
			defaultIcon: editor.buttons.compat_button_icon.icon,
			tooltip: button.tooltip,
			image: editor.buttons.compat_button_image.image,
		} );
	} );
} );
