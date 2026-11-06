/**
 * Drives the removed tinymce.util, tinymce.html, and plugin APIs without touching the DOM, so the
 * same script runs on TinyMCE 4 and on compat4x. V4_UTIL_LOG is its output on real TinyMCE 4.
 */
export const UTIL_PROBE_SOURCE = String.raw`// Pure API script: runs identically on v4 and compat4x.
window.utilProbe = async function ( echoUrl ) {
	const log = []; const L = ( name, value ) => log.push( name + ' ' + ( value === undefined ? 'undefined' : JSON.stringify( value ) ) );
	const tryIt = ( name, fn ) => { try { L( name, fn() ); } catch ( e ) { L( name, 'THROW ' + e.message ); } };
	const util = tinymce.util;

	// Promise, JSON.
	tryIt( 'Promise', () => util.Promise === window.Promise );
	[ 'a"b', "a'b", 'é\n\t\\', 1, null, true, [ 1, 'x', [ null ] ], { a: 1, b: { c: 'd' }, f() {} } ].forEach( ( value, i ) => {
		tryIt( 'serialize' + i, () => util.JSON.serialize( value ) );
		tryIt( 'serializeQ' + i, () => util.JSON.serialize( value, "'" ) );
	} );
	tryIt( 'parse', () => util.JSON.parse( '{"a":[1,2]}' ) );
	tryIt( 'parseBad', () => util.JSON.parse( '{nope' ) );

	// XHR.
	const xhr = ( settings ) => new Promise( ( resolve ) => {
		const out = {};
		const result = util.XHR.send( Object.assign( { url: echoUrl, scope: out, success( text, x, s ) { resolve( { ok: text, status: x.status, thisScope: this === out, sameSettings: s.url === echoUrl } ); }, error( type, x ) { resolve( { error: type, status: x.status, thisScope: this === out } ); } }, settings ) );
		out.result = result;
	} );
	L( 'xhrGet', await xhr( {} ) );
	L( 'xhrPost', await xhr( { data: 'a=1', content_type: 'application/x-www-form-urlencoded', requestheaders: [ { key: 'X-Fixture', value: 'yes' } ] } ) );
	L( 'xhr404', await xhr( { url: echoUrl + '?status=404' } ) );
	let events = [];
	const before = ( e ) => events.push( 'beforeInitialize:' + !! e.settings );
	const send = ( e ) => events.push( 'beforeSend:' + !! e.xhr + !! e.settings );
	util.XHR.on( 'beforeInitialize', before ); util.XHR.on( 'beforeSend', send );
	await xhr( {} );
	util.XHR.off( 'beforeInitialize', before ); util.XHR.off( 'beforeSend', send );
	L( 'xhrEvents', events );
	// A real file: Playwright cannot mock synchronous requests in WebKit.
	tryIt( 'xhrSync', () => { let got; util.XHR.send( { url: '/license.txt', async: false, success( text ) { got = text.slice( 0, 9 ); } } ); return got; } );

	// JSONRequest.
	const rpc = ( url, extra ) => new Promise( ( resolve ) => util.JSONRequest.sendRPC( Object.assign( { url, method: 'm', params: [ 1 ], success( r ) { resolve( { result: r } ); }, error( e, x ) { resolve( { error: e, hasXhr: !! x } ); } }, extra ) ) );
	L( 'rpcOk', await rpc( echoUrl + '?json=ok' ) );
	L( 'rpcError', await rpc( echoUrl + '?json=error' ) );
	L( 'rpcBad', await rpc( echoUrl + '?json=bad' ) );
	const instance = new util.JSONRequest( { url: echoUrl + '?json=ok' } );
	L( 'rpcInstance', await new Promise( ( resolve ) => instance.send( { method: 'x', params: [], success: ( r ) => resolve( r ), error: ( e ) => resolve( 'E' + e ) } ) ) );

	// JSONP.
	L( 'jsonp', await new Promise( ( resolve ) => {
		util.JSONP.send( { url: echoUrl + '?jsonp=' + util.JSONP.count, callback: ( json ) => resolve( { json, script: !! document.querySelector( '[id^="tinymce_jsonp_"]' ) } ) } );
	} ) );

	// Class.
	tryIt( 'class', () => {
		const A = util.Class.extend( { init( v ) { this.v = v; }, who() { return 'A' + this.v; }, Properties: 'color', Methods: 'noop', Statics: { make: () => 'static' } } );
		const Mix = { init() { this.mixed = true; }, mix() { return 'mix'; } };
		const B = A.extend( { Mixins: [ Mix ], who() { return 'B' + this._super(); } } );
		const b = new B( 1 );
		return { who: b.who(), mix: b.mix(), mixed: b.mixed, isA: b instanceof A, make: A.make(), chain: b.noop() === b, prop: b.color( 'red' ) === b && b.color(), hasExtend: typeof B.extend };
	} );

	// create, createNS.
	tryIt( 'createNS', () => { const ns = tinymce.createNS( 'compat4xProbe.a.b' ); ns.z = 1; return window.compat4xProbe.a.b.z; } );
	tryIt( 'create', () => {
		tinymce.create( 'compat4xProbe.Base', { Base: function ( v ) { this.v = v; }, hi() { return 'base' + this.v; }, other() { return 'other'; }, 'static': { st: () => 'st' } } );
		tinymce.create( 'compat4xProbe.Sub:compat4xProbe.Base', { Sub: function ( v ) { this.parent( v + 1 ); }, hi() { return 'sub-' + this.parent(); } } );
		tinymce.create( 'static compat4xProbe.Stat', { s: 1 } );
		const sub = new compat4xProbe.Sub( 1 );
		return { hi: sub.hi(), other: sub.other(), st: compat4xProbe.Base.st(), stat: compat4xProbe.Stat.s };
	} );

	// DOM aliases.
	tryIt( 'domQuery', () => typeof tinymce.dom.DomQuery );
	tryIt( 'domQueryUse', () => tinymce.dom.DomQuery( '<b>x</b>' ).length );
	tryIt( 'sizzle', () => typeof tinymce.dom.Sizzle );

	// SaxParser.
	const corpus = {
		basic: '<p class="a" id=b data-x=\'1\'>Hi <b>there</b> &amp; you</p>',
		voids: '<br><br/><img src="/a.png" alt=""/><hr />',
		malformed: '<td>loose</td><p>open<p>again<b>unclosed',
		selfclose: '<p>a<p>b<li>c<li>d',
		comment: 'a<!-- note -->b<!--[if IE]>x<![endif]-->c<!-->d',
		cdata: '<![CDATA[ x <!-- y --> ]]>',
		doctype: '<!DOCTYPE html><html><head><title>t</title></head></html>',
		pi: '<?php echo 1; ?>x',
		script: '<script>if (a<b) { c(); }</scr' + 'ipt><style>.a > b {}</style><textarea><i>raw</i></textarea>',
		urls: '<a href="javascript:alert(1)">x</a><a href="data:text/html,x">y</a><img src="data:image/png;base64,AA"><a href="java&#10;script:alert(1)">z</a>',
		entities: '&lt;b&gt; &copy; &#8217; &nbsp;',
		bool: '<input disabled checked="checked" value=1>',
		case: '<DIV CLASS="X"><P>y</P></DIV>',
		bogus: '<span data-mce-bogus="all">gone<b>x</b></span>k<span data-mce-bogus="1">kept</span>',
		internal: '<span data-mce-type="bookmark" onclick="x()">m</span>',
		text: 'just text < not a tag > and 1<2',
		unterminated: '<div class="a',
		custom: '<my-el a="1"><x:y>z</x:y></my-el>',
	};
	const run = ( html, settings, schema ) => {
		const events = [];
		const handlers = {
			start( name, attrs, empty ) { events.push( [ 'start', name, Array.prototype.map.call( attrs, ( a ) => [ a.name, a.value ] ), Object.keys( attrs.map ).sort(), !! empty ] ); },
			end( name ) { events.push( [ 'end', name ] ); },
			text( value, raw ) { events.push( [ 'text', value, !! raw ] ); },
			comment( value ) { events.push( [ 'comment', value ] ); },
			cdata( value ) { events.push( [ 'cdata', value ] ); },
			pi( name, value ) { events.push( [ 'pi', name, value === undefined ? null : value ] ); },
			doctype( value ) { events.push( [ 'doctype', value ] ); },
		};
		const parser = schema ? new tinymce.html.SaxParser( Object.assign( handlers, settings ), schema ) : new tinymce.html.SaxParser( Object.assign( handlers, settings ) );
		parser.parse( html );
		return events;
	};
	Object.keys( corpus ).forEach( ( key ) => {
		tryIt( 'sax:' + key, () => run( corpus[ key ], { validate: false } ) );
	} );
	tryIt( 'sax:condcomments', () => run( corpus.comment, { validate: false, allow_conditional_comments: true } ) );
	tryIt( 'sax:scripturl', () => run( corpus.urls, { validate: false, allow_script_urls: true, allow_html_data_urls: true } ) );
	tryIt( 'sax:removeinternals', () => run( corpus.internal, { validate: false, remove_internals: true } ) );
	tryIt( 'sax:noselfclose', () => run( corpus.selfclose, { validate: false, fix_self_closing: false } ) );
	tryIt( 'sax:validate', () => run( '<p class="a" onclick="x()" nope="1">t</p><nope>u</nope><a href="/x">v</a><a>w</a>', { validate: true } ) );
	tryIt( 'sax:customschema', () => run( '<p class="a" id="b">t</p><b>u</b>', { validate: true }, tinymce.html.Schema( { valid_elements: 'p[id]' } ) ) );
	tryIt( 'sax:nonew', () => typeof tinymce.html.SaxParser( {} ).parse );
	tryIt( 'sax:findEndTag', () => tinymce.html.SaxParser.findEndTag( tinymce.html.Schema(), '<b>a<i>b</i></b>rest', 3 ) );
	tryIt( 'sax:writer', () => {
		const writer = tinymce.html.Writer();
		new tinymce.html.SaxParser( { validate: false, start( n, a, e ) { writer.start( n, a, e ); }, end( n ) { writer.end( n ); }, text( v, r ) { writer.text( v, r ); } } ).parse( '<div class="a"><img src="/b.png">x &amp; y</div>' );
		return writer.getContent();
	} );

	tryIt( 'writer:html', () => { const w = tinymce.html.Writer( { element_format: 'html' } ); w.start( 'br', [], true ); return w.getContent(); } );
	tryIt( 'writer:new', () => { const w = new tinymce.html.Writer(); w.start( 'br', [], true ); return w.getContent(); } );
	tryIt( 'serializer', () => tinymce.html.Serializer( {} ).serialize( tinymce.html.DomParser( { validate: false } ).parse( '<p>a<br>b<img src="/c.png"></p><hr>' ) ) );
	tryIt( 'serializer:new', () => new tinymce.html.Serializer( { indent: false }, tinymce.html.Schema() ).serialize( tinymce.html.DomParser( { validate: false } ).parse( '<br>' ) ) );
	tryIt( 'serializer:html', () => tinymce.html.Serializer( { element_format: 'html' } ).serialize( tinymce.html.DomParser( { validate: false } ).parse( '<br>' ) ) );

	// Plugin styles: how PluginManager.add() plugins are called.
	const seen = {};
	tinymce.create( 'tinymce.plugins.Compat4xClass', {
		init( ed, url ) { seen.classInit = { sameEd: !! ed.getBody === !! ed.getBody, url: typeof url, thisIs: this instanceof tinymce.plugins.Compat4xClass }; ed.addButton( 'compat4xclass', { text: 'Class' } ); },
		getInfo() { return { longname: 'x' }; },
	} );
	tinymce.PluginManager.add( 'compat4xclass', tinymce.plugins.Compat4xClass );
	tinymce.PluginManager.add( 'compat4xfn', function ( ed, url, $ ) { this.api = () => 'api'; seen.fn = { args: arguments.length, hasDollar: typeof $, isNew: this instanceof Object && this !== window }; } );
	const ta = document.createElement( 'textarea' ); ta.id = 'compat4x-plugins'; document.body.appendChild( ta );
	const [ ed ] = await tinymce.init( { selector: '#compat4x-plugins', external_plugins: {}, plugins: 'compat4xclass compat4xfn', toolbar: 'compat4xclass' } );
	L( 'plugins', seen );
	L( 'pluginInstances', { cls: ed.plugins.compat4xclass instanceof tinymce.plugins.Compat4xClass, info: typeof ed.plugins.compat4xclass.getInfo, fn: ed.plugins.compat4xfn.api(), btn: !! ed.buttons.compat4xclass } );
	ed.remove();
	return log;
};
`;

export const V4_UTIL_LOG = [
	"Promise true",
	"serialize0 \"\\\"a\\\\\\\"b\\\"\"",
	"serializeQ0 \"'a\\\\\\\"b'\"",
	"serialize1 \"\\\"a'b\\\"\"",
	"serializeQ1 \"'a\\\\'b'\"",
	"serialize2 \"\\\"\\\\u00e9\\\\n\\\\t\\\\\\\\\\\"\"",
	"serializeQ2 \"'\\\\u00e9\\\\n\\\\t\\\\\\\\'\"",
	"serialize3 \"1\"",
	"serializeQ3 \"1\"",
	"serialize4 \"null\"",
	"serializeQ4 \"null\"",
	"serialize5 \"true\"",
	"serializeQ5 \"true\"",
	"serialize6 \"[1,\\\"x\\\",[null]]\"",
	"serializeQ6 \"[1,'x',[null]]\"",
	"serialize7 \"{\\\"a\\\":1,\\\"b\\\":{\\\"c\\\":\\\"d\\\"}}\"",
	"serializeQ7 \"{'a':1,'b':{'c':'d'}}\"",
	"parse {\"a\":[1,2]}",
	"parseBad undefined",
	"xhrGet {\"ok\":\"GET:::XMLHttpRequest:\",\"status\":200,\"thisScope\":true,\"sameSettings\":true}",
	"xhrPost {\"ok\":\"POST:a=1:yes:XMLHttpRequest:application/x-www-form-urlencoded\",\"status\":200,\"thisScope\":true,\"sameSettings\":true}",
	"xhr404 {\"error\":\"GENERAL\",\"status\":404,\"thisScope\":true}",
	"xhrEvents [\"beforeInitialize:true\",\"beforeSend:truetrue\"]",
	"xhrSync \"WordPress\"",
	"rpcOk {\"result\":{\"sent\":\"m\",\"ct\":\"application/json\"}}",
	"rpcError {\"error\":\"bad thing\",\"hasXhr\":true}",
	"rpcBad {\"error\":\"JSON Parse error.\",\"hasXhr\":true}",
	"rpcInstance {\"sent\":\"x\",\"ct\":\"application/json\"}",
	"jsonp {\"json\":{\"p\":1},\"script\":false}",
	"class {\"who\":\"BA1\",\"mix\":\"mix\",\"mixed\":true,\"isA\":true,\"make\":\"static\",\"chain\":true,\"prop\":\"red\",\"hasExtend\":\"function\"}",
	"createNS 1",
	"create {\"hi\":\"sub-base2\",\"other\":\"other\",\"st\":\"st\",\"stat\":1}",
	"domQuery \"function\"",
	"domQueryUse 1",
	"sizzle \"function\"",
	"sax:basic [[\"start\",\"p\",[[\"class\",\"a\"],[\"id\",\"b\"],[\"data-x\",\"1\"]],[\"class\",\"data-x\",\"id\"],false],[\"text\",\"Hi \",false],[\"start\",\"b\",[],[],false],[\"text\",\"there\",false],[\"end\",\"b\"],[\"text\",\" & you\",false],[\"end\",\"p\"]]",
	"sax:voids [[\"start\",\"br\",[],[],true],[\"start\",\"br\",[],[],true],[\"start\",\"img\",[[\"src\",\"/a.png\"],[\"alt\",\"\"]],[\"alt\",\"src\"],true],[\"start\",\"hr\",[],[],true]]",
	"sax:malformed [[\"start\",\"td\",[],[],false],[\"text\",\"loose\",false],[\"end\",\"td\"],[\"start\",\"p\",[],[],false],[\"text\",\"open\",false],[\"end\",\"p\"],[\"start\",\"p\",[],[],false],[\"text\",\"again\",false],[\"start\",\"b\",[],[],false],[\"text\",\"unclosed\",false],[\"end\",\"b\"],[\"end\",\"p\"]]",
	"sax:selfclose [[\"start\",\"p\",[],[],false],[\"text\",\"a\",false],[\"end\",\"p\"],[\"start\",\"p\",[],[],false],[\"text\",\"b\",false],[\"start\",\"li\",[],[],false],[\"text\",\"c\",false],[\"end\",\"li\"],[\"start\",\"li\",[],[],false],[\"text\",\"d\",false],[\"end\",\"li\"],[\"end\",\"p\"]]",
	"sax:comment [[\"text\",\"a\",false],[\"comment\",\" note \"],[\"text\",\"b\",false],[\"comment\",\" [if IE]>x<![endif]\"],[\"text\",\"c<!-->d\",false]]",
	"sax:cdata [[\"cdata\",\" x  y  \"]]",
	"sax:doctype [[\"doctype\",\" html\"],[\"start\",\"html\",[],[],false],[\"start\",\"head\",[],[],false],[\"start\",\"title\",[],[],false],[\"text\",\"t\",true],[\"end\",\"title\"],[\"end\",\"head\"],[\"end\",\"html\"]]",
	"sax:pi [[\"pi\",\"php\",\"echo 1; \"],[\"text\",\"x\",false]]",
	"sax:script [[\"start\",\"script\",[],[],false],[\"text\",\"if (a<b) { c(); }\",true],[\"end\",\"script\"],[\"start\",\"style\",[],[],false],[\"text\",\".a > b {}\",true],[\"end\",\"style\"],[\"start\",\"textarea\",[],[],false],[\"text\",\"<i>raw</i>\",true],[\"end\",\"textarea\"]]",
	"sax:urls [[\"start\",\"a\",[],[],false],[\"text\",\"x\",false],[\"end\",\"a\"],[\"start\",\"a\",[],[],false],[\"text\",\"y\",false],[\"end\",\"a\"],[\"start\",\"img\",[[\"src\",\"data:image/png;base64,AA\"]],[\"src\"],true],[\"start\",\"a\",[],[],false],[\"text\",\"z\",false],[\"end\",\"a\"]]",
	"sax:entities [[\"text\",\"<b> © ’  \",false]]",
	"sax:bool [[\"start\",\"input\",[[\"disabled\",\"disabled\"],[\"checked\",\"checked\"],[\"value\",\"1\"]],[\"checked\",\"disabled\",\"value\"],true]]",
	"sax:case [[\"start\",\"div\",[[\"class\",\"X\"]],[\"class\"],false],[\"start\",\"p\",[],[],false],[\"text\",\"y\",false],[\"end\",\"p\"],[\"end\",\"div\"]]",
	"sax:bogus [[\"text\",\"k\",false],[\"start\",\"span\",[[\"data-mce-bogus\",\"1\"]],[\"data-mce-bogus\"],false],[\"text\",\"kept\",false],[\"end\",\"span\"]]",
	"sax:internal [[\"start\",\"span\",[[\"data-mce-type\",\"bookmark\"]],[\"data-mce-type\"],false],[\"text\",\"m\",false],[\"end\",\"span\"]]",
	"sax:text [[\"text\",\"just text < not a tag > and 1<2\",false]]",
	"sax:unterminated [[\"text\",\"<div class=\\\"a\",false]]",
	"sax:custom [[\"start\",\"my-el\",[[\"a\",\"1\"]],[\"a\"],false],[\"start\",\"x:y\",[],[],false],[\"text\",\"z\",false],[\"end\",\"x:y\"],[\"end\",\"my-el\"]]",
	"sax:condcomments [[\"text\",\"a\",false],[\"comment\",\" note \"],[\"text\",\"b\",false],[\"comment\",\"[if IE]>x<![endif]\"],[\"text\",\"c<!-->d\",false]]",
	"sax:scripturl [[\"start\",\"a\",[[\"href\",\"javascript:alert(1)\"]],[\"href\"],false],[\"text\",\"x\",false],[\"end\",\"a\"],[\"start\",\"a\",[[\"href\",\"data:text/html,x\"]],[\"href\"],false],[\"text\",\"y\",false],[\"end\",\"a\"],[\"start\",\"img\",[[\"src\",\"data:image/png;base64,AA\"]],[\"src\"],true],[\"start\",\"a\",[[\"href\",\"java\\nscript:alert(1)\"]],[\"href\"],false],[\"text\",\"z\",false],[\"end\",\"a\"]]",
	"sax:removeinternals [[\"text\",\"m\",false]]",
	"sax:noselfclose [[\"start\",\"p\",[],[],false],[\"text\",\"a\",false],[\"start\",\"p\",[],[],false],[\"text\",\"b\",false],[\"start\",\"li\",[],[],false],[\"text\",\"c\",false],[\"start\",\"li\",[],[],false],[\"text\",\"d\",false],[\"end\",\"li\"],[\"end\",\"li\"],[\"end\",\"p\"],[\"end\",\"p\"]]",
	"sax:validate [[\"start\",\"p\",[[\"class\",\"a\"]],[\"class\"],false],[\"text\",\"t\",false],[\"end\",\"p\"],[\"text\",\"u\",false],[\"start\",\"a\",[[\"href\",\"/x\"]],[\"href\"],false],[\"text\",\"v\",false],[\"end\",\"a\"],[\"start\",\"a\",[],[],false],[\"text\",\"w\",false],[\"end\",\"a\"]]",
	"sax:customschema [[\"start\",\"p\",[[\"id\",\"b\"]],[\"id\"],false],[\"text\",\"t\",false],[\"end\",\"p\"],[\"text\",\"u\",false]]",
	"sax:nonew \"function\"",
	"sax:findEndTag 16",
	"sax:writer \"<div class=\\\"a\\\"><img src=\\\"/b.png\\\" />x &amp; y</div>\"",
	"writer:html \"<br>\"",
	"writer:new \"<br />\"",
	"serializer \"<p>a<br />b<img src=\\\"/c.png\\\" /></p><hr />\"",
	"serializer:new \"<br />\"",
	"serializer:html \"<br>\"",
	"plugins {\"classInit\":{\"sameEd\":true,\"url\":\"string\",\"thisIs\":true},\"fn\":{\"args\":3,\"hasDollar\":\"function\",\"isNew\":true}}",
	"pluginInstances {\"cls\":true,\"info\":\"function\",\"fn\":\"api\",\"btn\":true}"
];
