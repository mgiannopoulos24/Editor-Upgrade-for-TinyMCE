/**
 * Drives editor.windowManager through its v4 API without touching the DOM, so the same script
 * runs on TinyMCE 4 and on compat4x. V4_DIALOG_LOG is its output on real TinyMCE 4.
 */
export const DIALOG_PROBE_SOURCE = String.raw`// Pure API script: runs identically on v4 and v8.
window.dialogProbe = async function () {
	const ed = tinymce.get( 'content' ); const wm = ed.windowManager; const log = []; const L = ( ...a ) => log.push( a.map( ( x ) => typeof x === 'string' ? x : JSON.stringify( x ) ).join( ' ' ) );
	const body = [
		{ type: 'textbox', name: 'text', label: 'Text', value: 'from-item' },
		{ type: 'textbox', name: 'area', label: 'Area', multiline: true },
		{ type: 'listbox', name: 'list', label: 'List', values: [ { text: 'One', value: 1 }, { text: 'Two', value: 'two' } ] },
		{ type: 'listbox', name: 'listdata', label: 'L2', values: [ { text: 'One', value: 1 }, { text: 'Two', value: 'two' } ] },
		{ type: 'checkbox', name: 'check', text: 'Check', checked: true },
		{ type: 'checkbox', name: 'off', label: 'Off' },
		{ type: 'colorbox', name: 'color', label: 'Color' },
		{ type: 'filepicker', name: 'file', label: 'File', filetype: 'file' },
		{ type: 'label', text: 'A <b>label</b>' },
		{ type: 'container', html: '<i>hi</i>' },
		{ type: 'button', name: 'btn', text: 'Inner' },
		{ type: 'fieldset', label: 'FS', items: [ { type: 'textbox', name: 'nested' } ] },
	];
	const tryIt = ( name, fn ) => { try { const r = fn(); L( name, r === undefined ? 'undefined' : r ); return r; } catch ( e ) { L( name, 'THROW', e.message ); } };
	let win = wm.open( {
		title: 'T', body, data: { text: 'from-data', listdata: 'two', file: 'f.txt' },
		onsubmit( e ) { L( 'onsubmit', 'this===win', this === win, 'data', e.data, 'preventable', typeof e.preventDefault, 'ctl', !! e.control ); if ( window.keepOpen ) e.preventDefault(); },
		onclose( e ) { L( 'onclose', 'this===win', this === win, 'type', e && e.type ); },
		oncancel() { L( 'oncancel' ); },
		onPostRender() { L( 'onPostRender', 'this.find', typeof this.find ); },
	}, { p: 1 } );
	tryIt( 'toJSON', () => win.toJSON() );
	tryIt( 'windows', () => wm.getWindows().length );
	tryIt( 'getParams', () => wm.getParams() );
	tryIt( 'setParams', () => { wm.setParams( { p: 2 } ); return wm.getParams(); } );
	tryIt( 'win.params', () => win.params );
	tryIt( 'find#text', () => win.find( '#text' ).value() );
	tryIt( 'find#text[0]', () => win.find( '#text' )[ 0 ].value() );
	tryIt( 'find#text.length', () => win.find( '#text' ).length );
	tryIt( 'find#none', () => win.find( '#none' ).length );
	tryIt( 'findtype', () => win.find( 'checkbox' ).length );
	tryIt( 'set', () => { win.find( '#text' ).value( 'set' ); win.find( '#list' ).value( 'two' ); win.find( '#check' ).value( false ); return win.toJSON(); } );
	tryIt( 'fromJSON', () => { win.fromJSON( { area: 'json' } ); return win.toJSON().area; } );
	tryIt( 'disabled', () => { win.find( '#text' )[ 0 ].disabled( true ); return win.find( '#text' )[ 0 ].disabled(); } );
	tryIt( 'name', () => win.find( '#text' )[ 0 ].name() );
	tryIt( 'rootControl', () => win.find( '#text' )[ 0 ].rootControl === win );
	tryIt( 'chain', () => win.reflow && win.reflow() === win );
	window.keepOpen = true;
	tryIt( 'submit-kept', () => { win.submit(); return wm.getWindows().length; } );
	window.keepOpen = false;
	tryIt( 'submit-closes', () => { win.submit(); return wm.getWindows().length; } );

	win = wm.open( { title: 'U', body: [ { type: 'textbox', name: 'a' } ], onclose() { L( 'closed-u' ); }, oncancel() { L( 'cancel-u' ); } } );
	tryIt( 'wm.close', () => { wm.close(); return wm.getWindows().length; } );
	win = wm.open( { title: 'V', body: [ { type: 'textbox', name: 'a' } ], onclose() { L( 'closed-v' ); } } );
	tryIt( 'win.close', () => { win.close(); return wm.getWindows().length; } );

	const on = [];
	win = wm.open( { title: 'W', body: [ { type: 'textbox', name: 'a' } ], onsubmit() { on.push( 'attr' ); } } );
	win.on( 'submit', () => on.push( 'on' ) );
	tryIt( 'on-submit', () => { win.submit(); return on; } );

	win = wm.open( { title: 'B', items: { type: 'container', classes: 'wp-help', html: '<b>h</b>' }, buttons: { text: 'Close', onclick: 'close' } } );
	tryIt( 'items-form', () => win.toJSON() );
	tryIt( 'items-close', () => { win.close(); return wm.getWindows().length; } );

	win = wm.open( { title: 'Tabs', bodyType: 'tabpanel', body: [ { title: 'A', type: 'form', items: [ { type: 'textbox', name: 'ta', value: 'x' } ] }, { title: 'B', type: 'form', items: [ { type: 'textbox', name: 'tb', value: 'y' } ] } ] } );
	tryIt( 'tabs', () => win.toJSON() );
	win.close();
	return log;
};
`;

export const V4_DIALOG_LOG = [
	"onPostRender this.find function",
	"toJSON {\"text\":\"from-data\",\"area\":\"\",\"list\":1,\"listdata\":\"two\",\"check\":true,\"off\":false,\"color\":\"\",\"file\":\"f.txt\",\"btn\":\"\",\"nested\":\"\"}",
	"windows 1",
	"getParams {\"p\":1}",
	"setParams {\"p\":2}",
	"win.params {\"p\":2}",
	"find#text from-data",
	"find#text[0] from-data",
	"find#text.length 1",
	"find#none 0",
	"findtype 2",
	"set {\"text\":\"set\",\"area\":\"\",\"list\":\"two\",\"listdata\":\"two\",\"check\":false,\"off\":false,\"color\":\"\",\"file\":\"f.txt\",\"btn\":\"\",\"nested\":\"\"}",
	"fromJSON json",
	"disabled true",
	"name text",
	"rootControl true",
	"chain true",
	"onsubmit this===win true data {\"text\":\"set\",\"area\":\"json\",\"list\":\"two\",\"listdata\":\"two\",\"check\":false,\"off\":false,\"color\":\"\",\"file\":\"f.txt\",\"btn\":\"\",\"nested\":\"\"} preventable function ctl true",
	"submit-kept 1",
	"onsubmit this===win true data {\"text\":\"set\",\"area\":\"json\",\"list\":\"two\",\"listdata\":\"two\",\"check\":false,\"off\":false,\"color\":\"\",\"file\":\"f.txt\",\"btn\":\"\",\"nested\":\"\"} preventable function ctl true",
	"onclose this===win true type close",
	"submit-closes 0",
	"closed-u",
	"wm.close 0",
	"closed-v",
	"win.close 0",
	"on-submit [\"attr\",\"on\"]",
	"items-form {}",
	"items-close 0",
	"tabs {\"ta\":\"x\",\"tb\":\"y\"}"
];
