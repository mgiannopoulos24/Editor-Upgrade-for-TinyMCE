/**
 * Drives the tinymce.ui API without rendering, so the same script runs on TinyMCE 4 and on
 * compat4x. V4_UI_LOG is its output on real TinyMCE 4.
 */
export const UI_PROBE_SOURCE = String.raw`// Pure API script: runs identically on v4 and compat4x. It never renders a control.
window.uiProbe = function () {
	const log = []; const L = ( name, value ) => log.push( name + ' ' + ( value === undefined ? 'undefined' : JSON.stringify( value ) ) );
	const tryIt = ( name, fn ) => { try { L( name, fn() ); } catch ( e ) { L( name, 'THROW ' + e.message ); } };
	const ui = tinymce.ui; const F = ui.Factory;

	tryIt( 'classes', () => [ 'AbsoluteLayout', 'BrowseButton', 'Button', 'ButtonGroup', 'Checkbox', 'Collection', 'ColorBox', 'ColorButton', 'ColorPicker', 'ComboBox', 'Container', 'Control', 'DragHelper', 'DropZone', 'ElementPath', 'Factory', 'FieldSet', 'FilePicker', 'FitLayout', 'FlexLayout', 'FloatPanel', 'FlowLayout', 'Form', 'FormItem', 'FormatControls', 'GridLayout', 'Iframe', 'InfoBox', 'KeyboardNavigation', 'Label', 'Layout', 'ListBox', 'Menu', 'MenuBar', 'MenuButton', 'MenuItem', 'MessageBox', 'Movable', 'Notification', 'Panel', 'PanelButton', 'Path', 'Progress', 'Radio', 'ReflowQueue', 'Resizable', 'ResizeHandle', 'Scrollable', 'SelectBox', 'Selector', 'Slider', 'Spacer', 'SplitButton', 'StackLayout', 'TabPanel', 'TextBox', 'Throbber', 'Toolbar', 'Tooltip', 'Widget', 'Window' ].filter( ( name ) => ! ui[ name ] ) );
	tryIt( 'zIndex', () => ui.FloatPanel.zIndex );
	tryIt( 'hideAll', () => typeof ui.FloatPanel.hideAll );
	tryIt( 'extendable', () => [ 'Control', 'Widget', 'Container', 'Button', 'Panel', 'FloatPanel', 'Window', 'Menu', 'TextBox' ].map( ( name ) => typeof ui[ name ].extend ) );

	tryIt( 'has', () => [ F.has( 'button' ), F.has( 'Button' ), F.has( 'BUTTON' ), F.has( 'nope' ), F.has( 'textbox' ), F.has( 'window' ) ] );
	tryIt( 'createUnknown', () => F.create( { type: 'nope' } ) );
	tryIt( 'createUntyped', () => { try { F.create( {} ); return 'no throw'; } catch ( e ) { return e instanceof TypeError; } } );
	tryIt( 'createString', () => F.create( 'button', { text: 'x' } ).settings.text );
	tryIt( 'createObject', () => F.create( { type: 'button', text: 'y', name: 'n' } ).settings.name );
	tryIt( 'createInstance', () => F.create( 'button' ) instanceof ui.Button );
	tryIt( 'createPassthrough', () => { try { F.create( new ui.Control( {} ) ); return 'no throw'; } catch ( e ) { return e instanceof TypeError; } } );

	const Custom = ui.Control.extend( {
		Defaults: { fromDefault: 1 },
		init( settings ) { this._super( settings ); this.marker = 'init'; },
		renderHtml() { return '<div></div>'; },
		who() { return 'custom'; },
		Statics: { made: () => 'static' },
	} );
	tryIt( 'custom', () => { const c = new Custom( { a: 1 } ); return { marker: c.marker, who: c.who(), a: c.settings.a, fromDefault: c.settings.fromDefault, isControl: c instanceof ui.Control, st: Custom.made(), html: c.renderHtml() }; } );
	tryIt( 'factoryAdd', () => { F.add( 'compat4xcustom', Custom ); return [ F.has( 'compat4xcustom' ), F.create( { type: 'compat4xcustom', a: 2 } ).who(), F.create( { type: 'COMPAT4XCUSTOM' } ) instanceof Custom ]; } );

	const c = new ui.Control( { name: 'n1', text: 't1', value: 'v1', disabled: true, active: true, hidden: false } );
	tryIt( 'read', () => ( { settingsName: c.settings.name, name: c.name(), text: c.text(), disabled: c.disabled(), active: c.active(), visible: c.visible(), type: typeof c.type } ) );
	tryIt( 'write', () => { const chain = [ c.name( 'n2' ) === c, c.text( 't2' ) === c, c.disabled( false ) === c, c.active( false ) === c, c.visible( false ) === c ]; return { chain, name: c.name(), text: c.text(), disabled: c.disabled(), active: c.active(), visible: c.visible() }; } );
	tryIt( 'showHide', () => { const r = [ c.show() === c, c.visible(), c.hide() === c, c.visible() ]; c.show(); return r; } );
	tryIt( 'events', () => {
		const seen = [];
		const handler = function ( e ) { seen.push( [ this === c, e.type, e.control === c, e.detail, typeof e.preventDefault ] ); };
		const chain = c.on( 'custom', handler ) === c;
		const event = c.fire( 'custom', { detail: 1 } );
		c.off( 'custom', handler );
		c.fire( 'custom', { detail: 2 } );
		return { chain, seen, has: c.hasEventListeners( 'custom' ), prevented: typeof event.isDefaultPrevented };
	} );
	tryIt( 'settingHandler', () => { const seen = []; const x = new ui.Control( { onclick() { seen.push( 'lower' ); }, onMouseDown() { seen.push( 'camel' ); } } ); x.fire( 'click' ); x.fire( 'mousedown' ); return seen; } );
	tryIt( 'classesApi', () => { const x = new ui.Control( { classes: 'one two' } ); x.classes.add( 'three' ); x.classes.remove( 'one' ); return [ x.classes.contains( 'two' ), x.classes.contains( 'three' ), x.classes.contains( 'one' ) ]; } );
	tryIt( 'parent', () => { const a = new ui.Control( {} ); const b = new ui.Control( {} ); b.parent( a ); return [ b.parent() === a, a.parent() === undefined || a.parent() === null ]; } );
	tryIt( 'data', () => typeof c.data );
	tryIt( 'aria', () => c.aria( 'label', 'x' ) === c );
	tryIt( 'container', () => { const box = new ui.Container( { items: [ { type: 'button', text: 'a', name: 'first' } ] } ); return { isControl: box instanceof ui.Control, items: typeof box.items, add: typeof box.add, find: typeof box.find }; } );
	tryIt( 'messageBox', () => [ typeof ui.MessageBox.alert, typeof ui.MessageBox.confirm, typeof ui.MessageBox.msgBox ] );
	tryIt( 'collection', () => { const list = new ui.Collection( [ new ui.Control( { name: 'a' } ) ] ); return { length: list.length, first: list[ 0 ].name(), name: list.name() }; } );
	return log;
};
`;

export const V4_UI_LOG = [
	"classes []",
	"zIndex 100100",
	"hideAll \"function\"",
	"extendable [\"function\",\"function\",\"function\",\"function\",\"function\",\"function\",\"function\",\"function\",\"function\"]",
	"has [true,true,true,false,true,true]",
	"createUnknown \"THROW Could not find control by type: nope\"",
	"createUntyped true",
	"createString \"x\"",
	"createObject \"n\"",
	"createInstance true",
	"createPassthrough true",
	"custom {\"marker\":\"init\",\"who\":\"custom\",\"a\":1,\"fromDefault\":1,\"isControl\":true,\"st\":\"static\",\"html\":\"<div></div>\"}",
	"factoryAdd [true,\"custom\",true]",
	"read {\"settingsName\":\"n1\",\"name\":\"n1\",\"text\":\"t1\",\"disabled\":true,\"active\":true,\"visible\":true,\"type\":\"undefined\"}",
	"write {\"chain\":[true,true,true,true,true],\"name\":\"n2\",\"text\":\"t2\",\"disabled\":false,\"active\":false,\"visible\":false}",
	"showHide [true,true,true,false]",
	"events {\"chain\":true,\"seen\":[[true,\"custom\",true,1,\"function\"]],\"has\":false,\"prevented\":\"function\"}",
	"settingHandler []",
	"classesApi [true,true,false]",
	"parent [true,true]",
	"data \"object\"",
	"aria true",
	"container {\"isControl\":true,\"items\":\"function\",\"add\":\"function\",\"find\":\"function\"}",
	"messageBox [\"function\",\"function\",\"function\"]",
	"collection {\"length\":1,\"first\":\"a\",\"name\":\"a\"}"
];
