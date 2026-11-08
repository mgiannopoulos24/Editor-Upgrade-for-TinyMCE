/**
 * Compatibility fixture: class_extend. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_class_extend', function () {
	var Base = tinymce.util.Class.extend( {
		init: function ( value ) {
			this.value = value;
		},
		who: function () {
			return 'base' + this.value;
		},
		Properties: 'color',
		Statics: { make: function () {
			return 'static';
		} }
	} );
	var Child = Base.extend( {
		who: function () {
			return 'child-' + this._super();
		}
	} );
	var child = new Child( 1 );

	compatDone( 'class_extend', {
		who: child.who(),
		isBase: child instanceof Base,
		color: child.color( 'red' ).color(),
		statics: Base.make(),
		createNS: typeof tinymce.createNS,
		domQuery: typeof tinymce.dom.DomQuery,
		sizzle: typeof tinymce.dom.Sizzle,
	} );
} );
