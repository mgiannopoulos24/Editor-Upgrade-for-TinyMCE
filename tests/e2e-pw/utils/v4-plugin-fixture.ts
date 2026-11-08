// A plugin written against the TinyMCE 4 API, registered the way mce_external_plugins does.
export const PLUGIN_SOURCE = `
tinymce.PluginManager.add( 'compat4xfixture', function ( editor ) {
	editor.addButton( 'fixture_cmd', { text: 'Run command', cmd: 'fixtureCommand' } );
	editor.addButton( 'fixture_state', {
		text: 'State',
		stateSelector: 'strong'
	} );
	editor.addButton( 'fixture_postrender', {
		text: 'Post render',
		onPostRender: function () {
			this.active( true );
			window.compat4xLog.push( 'postrender:' + this.active() );
		}
	} );
	editor.addButton( 'fixture_menu', {
		type: 'menubutton',
		text: 'Menu',
		icon: false,
		menu: [
			{ text: 'First', onclick: function () { window.compat4xLog.push( 'menu:first' ); } },
			{ text: '-' },
			{ text: 'Nested', menu: [ { text: 'Inner', onclick: function () { window.compat4xLog.push( 'menu:inner' ); } } ] }
		]
	} );
	editor.addButton( 'fixture_list', {
		type: 'listbox',
		text: 'Pick',
		values: [ { text: 'Alpha', value: 'a' }, { text: 'Beta', value: 'b' } ],
		onselect: function () {
			window.compat4xLog.push( 'list:' + this.value() );
		}
	} );
	editor.addButton( 'fixture_split', {
		type: 'splitbutton',
		text: 'Split',
		onclick: function () { window.compat4xLog.push( 'split:main' ); },
		menu: [ { text: 'Other', onclick: function () { window.compat4xLog.push( 'split:other' ); } } ]
	} );
	editor.addButton( 'fixture_builtin_icon', { tooltip: 'Builtin icon', icon: 'bullist', onclick: function () {} } );
	editor.addButton( 'fixture_css_icon', { tooltip: 'CSS icon', icon: 'fixture-css', onclick: function () {} } );
	editor.addButton( 'fixture_image', { tooltip: 'Image icon', image: 'https://example.org/i.png', onclick: function () {} } );
	editor.addButton( 'fixture_dashicon', { tooltip: 'Dashicon', icon: 'dashicon dashicons-admin-links', onclick: function () {} } );

	editor.addMenuItem( 'fixture_item', {
		text: 'Menu item',
		onclick: function () { window.compat4xLog.push( 'item:click' ); }
	} );
	editor.addMenuItem( 'fixture_toggle', { text: 'Toggle item', selectable: true, stateSelector: 'strong' } );
	editor.addMenuItem( 'fixture_nested', {
		text: 'Nested item',
		menu: [ { text: 'Inner item', onclick: function () { window.compat4xLog.push( 'item:inner' ); } } ]
	} );
	editor.addMenuItem( 'fixture_context', {
		text: 'Context item',
		context: 'edit',
		separator: 'before',
		onclick: function () { window.compat4xLog.push( 'item:context' ); }
	} );
	editor.addButton( 'fixture_control', {
		text: 'Control',
		onPostRender: function () {
			var control = this;

			control.on( 'custom', function ( event ) {
				window.compat4xLog.push( 'custom:' + event.detail );
			} );
			window.compat4xControl = control;
		},
		onclick: function () { this.fire( 'custom', { detail: this.getEl().getAttribute( 'data-mce-name' ) } ); }
	} );
	editor.on( 'SaveContent', function ( event ) {
		event.content += '<!-- saved by fixture -->';
	} );
	editor.addCommand( 'fixtureCommand', function () { window.compat4xLog.push( 'cmd' ); } );
} );
`;
