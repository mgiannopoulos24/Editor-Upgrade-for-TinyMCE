/**
 * Compatibility fixture: create_class. Written against the TinyMCE 4 API.
 */
tinymce.create( 'tinymce.plugins.CompatCreateClass', {
	init: function ( editor, url ) {
		var self = this;

		editor.addButton( 'compat_create_class', { title: 'Fixture class', cmd: 'compatClassCmd' } );
		editor.on( 'init', function () {
			compatDone( 'create_class', {
				isInstance: self instanceof tinymce.plugins.CompatCreateClass,
				registered: editor.plugins.compat_create_class === self,
				info: self.getInfo().longname,
				button: editor.buttons.compat_create_class.tooltip,
				urlIsString: typeof url,
			} );
		} );
	},
	getInfo: function () {
		return { longname: 'Fixture class' };
	}
} );
tinymce.PluginManager.add( 'compat_create_class', tinymce.plugins.CompatCreateClass );
