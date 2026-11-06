/**
 * Compatibility fixture: ui_factory. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_ui_factory', function ( editor ) {
	var ui = tinymce.ui;
	var Preview = ui.Control.extend( {
		Defaults: { size: 1 },
		init: function ( settings ) {
			this._super( settings );
			this.marker = 'init';
		},
		label: function () {
			return 'preview:' + this.settings.size;
		}
	} );

	ui.Factory.add( 'compatpreview', Preview );

	var control = ui.Factory.create( { type: 'compatpreview', name: 'n' } );
	var missing;

	try {
		ui.Factory.create( { type: 'compatnope' } );
	} catch ( error ) {
		missing = error.message;
	}

	compatDone( 'ui_factory', {
		label: control.label(),
		marker: control.marker,
		name: control.name(),
		isControl: control instanceof ui.Control,
		has: ui.Factory.has( 'COMPATPREVIEW' ),
		missing: missing,
		hideAll: typeof ui.FloatPanel.hideAll,
		zIndex: ui.FloatPanel.zIndex,
	} );
} );
