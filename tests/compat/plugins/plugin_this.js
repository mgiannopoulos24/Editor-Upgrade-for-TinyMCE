/**
 * Compatibility fixture: plugin_this. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_plugin_this', function ( editor, url, dollar ) {
	this.getInfo = function () {
		return { longname: 'Fixture' };
	};
	this.instanceMarker = 'instance';

	var self = this;

	editor.on( 'init', function () {
		compatDone( 'plugin_this', {
			sameInstance: editor.plugins.compat_plugin_this === self,
			marker: editor.plugins.compat_plugin_this.instanceMarker,
			info: editor.plugins.compat_plugin_this.getInfo().longname,
			hasDollarArg: typeof dollar,
			urlIsString: typeof url,
		} );
	} );
} );
