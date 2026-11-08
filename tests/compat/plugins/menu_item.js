/**
 * Compatibility fixture: menu_item. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_menu_item', function ( editor ) {
	editor.addMenuItem( 'compat_menu_item', {
		text: 'Fixture menu item',
		context: 'tools',
		cmd: 'compatMenuCmd'
	} );
	editor.on( 'init', function () {
		var item = editor.menuItems.compat_menu_item;

		compatDone( 'menu_item', { text: item.text, context: item.context, cmd: item.cmd } );
	} );
} );
