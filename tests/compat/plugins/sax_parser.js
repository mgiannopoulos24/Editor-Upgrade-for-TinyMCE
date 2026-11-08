/**
 * Compatibility fixture: sax_parser. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_sax_parser', function ( editor ) {
	var events = [];

	new tinymce.html.SaxParser( {
		validate: false,
		start: function ( name, attrs, empty ) {
			events.push( 'start:' + name + ':' + ( attrs.map.href || '' ) + ':' + !! empty );
		},
		end: function ( name ) {
			events.push( 'end:' + name );
		},
		text: function ( value ) {
			events.push( 'text:' + value );
		},
		comment: function ( value ) {
			events.push( 'comment:' + value );
		}
	} ).parse( '<p>a<!-- c --><a href="/x">b &amp; c</a><br></p>' );

	var writer = tinymce.html.Writer();

	writer.start( 'img', [ { name: 'src', value: '/a.png' } ], true );
	compatDone( 'sax_parser', { events: events, written: writer.getContent() } );
} );
