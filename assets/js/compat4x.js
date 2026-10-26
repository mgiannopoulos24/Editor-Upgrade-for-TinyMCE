/**
 * compat4x: TinyMCE 4 compatibility layer for TinyMCE 8.
 *
 * Loaded as the core `wp-tinymce` handle, right after TinyMCE 8 itself. Phase 1 scope: the
 * globals core's own editor bootstrap relies on, and settings normalization for every
 * `tinymce.init()` call. The API shims (`editor.addButton()`, `editor.settings`, ...) are
 * Phase 2; see docs/plan.md, Section 7.4.
 *
 * @package Editor_Upgrade_For_TinyMCE
 */
( function ( tinymce, $, config ) {
	'use strict';

	var V4_THEMES = [ 'modern', 'inlite' ];

	function warn( message ) {
		if ( config.debug && window.console ) {
			window.console.warn( '[Editor Upgrade for TinyMCE] ' + message );
		}
	}

	/*
	 * tinymce.$ was TinyMCE 4's DomQuery. Core still uses it (WP_Editor::editor_js(),
	 * wp/editor/base.js, dfw.js); jQuery covers the methods it calls.
	 */
	if ( ! tinymce.$ ) {
		tinymce.$ = $;
	}

	/*
	 * editor.$ was a DomQuery scoped to the editor's iframe document. wp/editor/base.js
	 * uses it to build and find the selection markers when switching Visual/Code.
	 */
	function shimDomQuery( editor ) {
		if ( ! editor.$ ) {
			editor.$ = function ( selector, context ) {
				return $( selector, context || editor.getDoc() || document );
			};
		}
	}

	/*
	 * editor.settings was the raw settings object. TinyMCE 8 only returns registered options,
	 * so unknown names (wp_autoresize_on, wpeditimage_*, ...) are registered on first access,
	 * which makes TinyMCE read them from the initial settings.
	 */
	function shimSettings( editor ) {
		var options = editor.options;

		if ( editor.settings ) {
			return;
		}

		function ensureRegistered( name ) {
			if ( ! options.isRegistered( name ) ) {
				options.register( name, {
					processor: function () {
						return true;
					},
				} );
			}
		}

		editor.settings = new Proxy( {}, {
			get: function ( target, name ) {
				if ( typeof name !== 'string' ) {
					return undefined;
				}

				ensureRegistered( name );
				return options.get( name );
			},
			set: function ( target, name, value ) {
				ensureRegistered( name );
				options.set( name, value );
				return true;
			},
		} );
	}

	// editor.theme.resizeTo( width, height ) set the height of the editing area.
	function shimThemeResize( editor ) {
		editor.on( 'init', function () {
			editor.theme = editor.theme || {};

			if ( editor.theme.resizeTo ) {
				return;
			}

			editor.theme.resizeTo = function ( width, height ) {
				var container = editor.getContainer();
				var area = editor.getContentAreaContainer();

				if ( height && container && area ) {
					container.style.height = height + container.offsetHeight - area.offsetHeight + 'px';
				}
			};
		} );
	}

	/*
	 * WordPress switches Visual/Code by putting invisible marker spans in the textarea and
	 * reading them back when the editor is shown. TinyMCE 8 unwraps `data-mce-type="bookmark"`
	 * spans and drops empty ones, so the marker vanishes and core's scroll helper throws on
	 * `editor.$( '.mce_SELRES_start' ).offset().top`. Keep the marker spans as ordinary empty
	 * inline spans (with a zero-width space) until core removes them.
	 */
	function prepareMarkerSpans( value ) {
		return value.replace(
			/<span\b([^>]*\bmce_SELRES_(?:start|end)\b[^>]*)>([\s\S]*?)<\/span>/gi,
			function ( match, attributes, content ) {
				attributes = attributes.replace( /\sdata-mce-type\s*=\s*(?:"bookmark"|'bookmark')/gi, '' );

				if ( ! content || /^(?:\ufeff|&#65279;|&#xfeff;|\s)*$/i.test( content ) ) {
					content = '\u200b';
				}

				return '<span' + attributes + '>' + content + '</span>';
			}
		);
	}

	// editor.load() reads the textarea; patch it before TinyMCE parses the marker spans.
	function shimBookmarks( editor ) {
		var load = editor.load;

		if ( ! load || load.compat4x ) {
			return;
		}

		editor.load = function () {
			var element = editor.getElement();

			if ( element && typeof element.value === 'string' ) {
				element.value = prepareMarkerSpans( element.value );
			}

			return load.apply( editor, arguments );
		};

		editor.load.compat4x = true;
	}

	tinymce.on( 'AddEditor', function ( event ) {
		shimDomQuery( event.editor );
		shimSettings( event.editor );
		shimThemeResize( event.editor );
		shimBookmarks( event.editor );
	} );

	// TinyMCE 4 exposed editors as an array that was also keyed by editor ID.
	if ( ! ( 'editors' in tinymce ) ) {
		Object.defineProperty( tinymce, 'editors', {
			configurable: true,
			get: function () {
				var editors = tinymce.get();

				editors.forEach( function ( editor ) {
					editors[ editor.id ] = editor;
				} );

				return editors;
			},
		} );
	}

	/*
	 * TinyMCE 8 separates toolbar items with spaces; TinyMCE 4 and WordPress use commas
	 * (for example, `formatselect,bold,italic`). Without this, a whole row is read as one
	 * unknown item and the toolbar renders empty.
	 *
	 * `toolbar` accepts a string or an array of strings (one row per entry), and
	 * `toolbar1`..`toolbar9` are strings.
	 */
	var TOOLBAR_SETTINGS = [ 'toolbar' ];

	for ( var i = 1; i <= 9; i++ ) {
		TOOLBAR_SETTINGS.push( 'toolbar' + i );
	}

	// TinyMCE 6 renamed these buttons; WordPress and older plugins still use the v4 names.
	var TOOLBAR_ITEMS = {
		formatselect: 'blocks',
		styleselect: 'styles',
		fontselect: 'fontfamily',
		fontsizeselect: 'fontsize'
	};

	function normalizeToolbarItem( item ) {
		return TOOLBAR_ITEMS[ item ] || item;
	}

	function normalizeToolbar( toolbar ) {
		if ( typeof toolbar === 'string' ) {
			var items = toolbar.split( /[\s,]+/ );

			return items
				.filter( function ( item ) {
					return item;
				} )
				.map( normalizeToolbarItem )
				.join( ' ' );
		}

		if ( Array.isArray( toolbar ) ) {
			return toolbar.map( normalizeToolbar );
		}

		return toolbar;
	}

	function normalizeToolbars( settings ) {
		TOOLBAR_SETTINGS.forEach( function ( name ) {
			if ( name in settings ) {
				settings[ name ] = normalizeToolbar( settings[ name ] );
			}
		} );
	}

	function normalizePlugins( settings ) {
		var external = settings.external_plugins || {};
		var plugins = settings.plugins;

		if ( ! plugins ) {
			return;
		}

		if ( typeof plugins === 'string' ) {
			plugins = plugins.split( /[\s,]+/ );
		}

		settings.plugins = plugins.filter( function ( name ) {
			var keep = name && ( config.plugins.indexOf( name ) > -1 || external.hasOwnProperty( name ) );

			if ( name && ! keep ) {
				warn( 'Skipped TinyMCE plugin "' + name + '": not available in TinyMCE 8.' );
			}

			return keep;
		} );
	}

	/*
	 * Core prints an empty plugin list for the Classic block as `[]`, and plugins may pass a PHP
	 * array. TinyMCE 8 only accepts an object and drops an array, which then crashes its license
	 * key manager on Object.keys(undefined).
	 */
	function normalizeExternalPlugins( settings ) {
		if ( Array.isArray( settings.external_plugins ) ) {
			settings.external_plugins = $.extend( {}, settings.external_plugins );
		}
	}

	// Same rules as Editor_Upgrade_For_TinyMCE_Settings::apply_license_rules().
	function applyLicenseRules( settings ) {
		if ( ! settings.license_key ) {
			settings.license_key = 'gpl';
		}

		if ( String( settings.license_key ).toLowerCase() === 'gpl' && settings.api_key ) {
			delete settings.api_key;
			warn( 'Removed "api_key": TinyMCE 8 disables the editor when it is combined with the GPL license key.' );
		}
	}

	function normalizeSettings( settings ) {
		settings.base_url = config.baseUrl;
		settings.suffix = config.suffix;
		settings.cache_suffix = config.cacheSuffix;
		settings.promotion = false;
		settings.branding = false;

		if ( ! settings.theme || V4_THEMES.indexOf( settings.theme ) > -1 ) {
			settings.theme = 'silver';
		}

		if ( settings.skin === 'lightgray' ) {
			settings.skin = 'oxide';
		}

		// TinyMCE 8 accepts true, false, or 'both' for `resize`; `'vertical'` is invalid.
		if ( settings.resize === 'vertical' ) {
			settings.resize = true;
		}

		normalizeToolbars( settings );
		normalizeExternalPlugins( settings );
		normalizePlugins( settings );
		applyLicenseRules( settings );

		// Removed in TinyMCE 8 and no longer used by WordPress; v8 warns at init.
		delete settings.tabfocus_elements;

		return settings;
	}

	var init = tinymce.init;

	tinymce.init = function ( settings ) {
		return init.call( tinymce, normalizeSettings( $.extend( {}, settings ) ) );
	};
} )( window.tinymce, window.jQuery, window.editorUpgradeForTinyMCE );
