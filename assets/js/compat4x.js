/**
 * compat4x: TinyMCE 4 compatibility layer for TinyMCE 8.
 *
 * Loaded as the core `wp-tinymce` handle, right after TinyMCE 8 itself. Covers the globals
 * core's own editor bootstrap relies on, settings normalization for every `tinymce.init()`
 * call, and the v4 editor APIs third-party plugins call; see docs/plan.md, Section 7.4.
 *
 * @package Editor_Upgrade_For_TinyMCE
 */
( function ( tinymce, $, config ) {
	'use strict';

	var V4_THEMES = [ 'modern', 'inlite' ];

	// TinyMCE 4 icon names that TinyMCE 8 renamed. Other built-in names are unchanged.
	var RENAMED_ICONS = {
		alignjustify: 'align-justify',
		aligncenter: 'align-center',
		alignleft: 'align-left',
		alignright: 'align-right',
		anchor: 'bookmark',
		backcolor: 'highlight-bg-color',
		blockquote: 'quote',
		bullist: 'unordered-list',
		charmap: 'insert-character',
		code: 'sourcecode',
		emoticons: 'emoji',
		forecolor: 'text-color',
		hr: 'horizontal-rule',
		insertdatetime: 'insert-time',
		media: 'embed',
		newdocument: 'new-document',
		nonbreaking: 'non-breaking',
		numlist: 'ordered-list',
		pagebreak: 'page-break',
		removeformat: 'remove-formatting',
		restoredraft: 'restore-draft',
		searchreplace: 'search',
		strikethrough: 'strike-through'
	};

	// TinyMCE 8's default menus, limited to its open source items. A menu in the `menu` setting
	// replaces the default one, so adding a v4 `context` item must include these.
	var DEFAULT_MENUS = {
		file: { title: 'File', items: 'newdocument restoredraft | preview | export print' },
		edit: { title: 'Edit', items: 'undo redo | cut copy paste pastetext | selectall | searchreplace' },
		view: { title: 'View', items: 'code | visualaid visualchars visualblocks | spellchecker | preview fullscreen' },
		insert: { title: 'Insert', items: 'image link media inserttable codesample accordion | charmap emoticons hr | pagebreak nonbreaking anchor | insertdatetime' },
		format: { title: 'Format', items: 'bold italic underline strikethrough superscript subscript codeformat | styles blocks fontfamily fontsize align lineheight | forecolor backcolor | language | removeformat' },
		tools: { title: 'Tools', items: 'spellchecker spellcheckerlanguage | code wordcount' },
		table: { title: 'Table', items: 'inserttable | cell row column | tableprops deletetable' },
		help: { title: 'Help', items: 'help' },
	};

	// TinyMCE 4 plugins that became core features in TinyMCE 8, so nothing is lost by skipping them.
	var MERGED_PLUGINS = [ 'colorpicker', 'contextmenu', 'hr', 'noneditable', 'paste', 'print', 'tabfocus', 'textcolor', 'textpattern' ];

	/*
	 * v4 class names on the TinyMCE 8 chrome, for plugin CSS and core's `.mce-toolbar-grp` lookups.
	 * Not `.mce-btn`, `.mce-btn-group`, or `.mce-toolbar`: core's editor.css would restyle every
	 * toolbar button, and a plugin's own rules for them expect the v4 layout anyway.
	 */
	var LEGACY_CLASSES = {
		'.tox-tinymce': 'mce-tinymce',
		'.tox-editor-header': 'mce-toolbar-grp',
		'.tox-edit-area': 'mce-edit-area',
		'.tox-statusbar': 'mce-statusbar',
		'.tox-menubar': 'mce-menubar',
		'.tox-menu': 'mce-menu',
		'.tox-dialog': 'mce-window',
		'.tox-pop': 'mce-floatpanel',
	};

	var warned = {};

	function warn( message ) {
		if ( config.debug && window.console ) {
			window.console.warn( '[Editor Upgrade for TinyMCE] ' + message );
		}
	}

	function warnOnce( key, message ) {
		if ( ! warned[ key ] ) {
			warned[ key ] = true;
			warn( message );
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
				var result = $( selector, context || editor.getDoc() || document );

				// DomQuery returned a zero position for an empty set; jQuery returns undefined.
				if ( ! result.length ) {
					result.offset = function ( coordinates ) {
						return coordinates ? result : { left: 0, top: 0 };
					};
				}

				return result;
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
		// The content of these elements is not edited, so a marker inside would be saved with it.
		value = value.replace(
			/(<(iframe|audio|video|object|noscript|script|style)\b[^>]*>)([\s\S]*?)(<\/\2>)/gi,
			function ( match, open, tag, content, close ) {
				return open + content.replace( /<span\b[^>]*\bmce_SELRES_(?:start|end)\b[^>]*>[\s\S]*?<\/span>/gi, '' ) + close;
			}
		);

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

	// v4 event handlers were settings such as `onclick`, `onClick`, or `onPostRender`.
	function getHandler( settings, name ) {
		var found = null;

		Object.keys( settings ).forEach( function ( key ) {
			if ( key.toLowerCase() === 'on' + name && typeof settings[ key ] === 'function' ) {
				found = settings[ key ];
			}
		} );

		return found;
	}

	/*
	 * The `this` of a v4 UI callback. TinyMCE 8 only exposes an API object while the component
	 * is mounted, so the state is kept here and applied when the component mounts. `host` holds
	 * the editor, the toolbar item name (when there is one), and the icon name resolver.
	 */
	function createControl( settings, host ) {
		var api = null;
		var listeners = {};
		var state = {
			active: !! settings.active,
			disabled: !! settings.disabled,
			icon: settings.icon,
			text: settings.text,
			value: settings.value,
		};

		function accessor( name, apply ) {
			return function ( value ) {
				if ( ! arguments.length ) {
					return state[ name ];
				}

				state[ name ] = value;

				if ( api ) {
					apply( value );
				}

				return control;
			};
		}

		function eachEventName( names, callback ) {
			names.toLowerCase().split( /\s+/ ).forEach( callback );
		}

		var control = {
			settings: settings,
			active: accessor( 'active', function ( value ) {
				if ( api.setActive ) {
					api.setActive( !! value );
				}
			} ),
			disabled: accessor( 'disabled', function ( value ) {
				if ( api.setEnabled ) {
					api.setEnabled( ! value );
				}
			} ),
			icon: accessor( 'icon', function ( value ) {
				if ( api.setIcon ) {
					api.setIcon( host.resolveIconName( value ) );
				}
			} ),
			text: accessor( 'text', function ( value ) {
				if ( api.setText ) {
					api.setText( value );
				}
			} ),
			value: accessor( 'value', function () {} ),
			name: function () {
				return host.name;
			},
			on: function ( names, callback ) {
				eachEventName( names, function ( name ) {
					listeners[ name ] = ( listeners[ name ] || [] ).concat( callback );
				} );
				return control;
			},
			off: function ( names, callback ) {
				eachEventName( names, function ( name ) {
					listeners[ name ] = callback ? ( listeners[ name ] || [] ).filter( function ( listener ) {
						return listener !== callback;
					} ) : [];
				} );
				return control;
			},
			fire: function ( name, event ) {
				var lowerName = name.toLowerCase();
				var prevented = false;
				var args = $.extend( {
					control: control,
					type: lowerName,
					preventDefault: function () {
						prevented = true;
					},
					isDefaultPrevented: function () {
						return prevented;
					},
				}, event );
				var handler = getHandler( settings, lowerName );

				if ( handler ) {
					handler.call( control, args );
				}

				( listeners[ lowerName ] || [] ).forEach( function ( listener ) {
					listener.call( control, args );
				} );

				return args;
			},
			// Only toolbar items have a stable element in TinyMCE 8; menu items are rebuilt on open.
			getEl: function () {
				var container = host.editor.getContainer();

				return host.name && container ?
					container.querySelector( '[data-mce-name="' + host.name.toLowerCase() + '"]' ) :
					null;
			},
			visible: function ( isVisible ) {
				var element = control.getEl();

				if ( ! arguments.length ) {
					return !! element && element.style.display !== 'none';
				}

				if ( element ) {
					element.style.display = isVisible ? '' : 'none';
				}

				return control;
			},
			show: function () {
				return control.visible( true );
			},
			hide: function () {
				return control.visible( false );
			},
			bind: function ( newApi ) {
				api = newApi;

				if ( settings.stateSelector || 'active' in settings ) {
					control.active( state.active );
				}

				if ( state.disabled ) {
					control.disabled( true );
				}
			},
		};

		return control;
	}

	function trigger( control, name, event ) {
		control.fire( name, event );
	}

	/*
	 * editor.addButton(), editor.addMenuItem(), editor.buttons, and editor.menuItems, which
	 * TinyMCE 8 replaced with editor.ui.registry. Runs before `setup` callbacks, when TinyMCE
	 * has not loaded its icons yet.
	 */
	function shimUi( editor ) {
		var registry = editor.ui.registry;
		var v4Specs = { buttons: {}, menuItems: {} };
		var pendingIcons = [];
		var scriptsLoaded = false;
		var imageCount = 0;
		var menuContexts = {};

		function isKnownIcon( name ) {
			var key = name.toLowerCase();

			return !! (
				registry.getAll().icons[ key ] ||
				tinymce.IconManager.get( 'default' ).icons[ key ] ||
				tinymce.IconManager.get( editor.options.get( 'icons' ) ).icons[ key ]
			);
		}

		// v4 rendered icons as `<i class="mce-ico mce-i-NAME">`, styled by the plugin's own CSS.
		function registerCssIcon( name ) {
			var isDashicon = name.indexOf( 'dashicon ' ) === 0;
			var classes = 'mce-ico mce-i-' + name + ( isDashicon ? ' dashicons' : '' );

			// The inline font is needed because the TinyMCE skin resets font-family on its children.
			var font = isDashicon ? 'font-family:dashicons;' : '';

			registry.addIcon(
				name,
				'<i class="' + tinymce.DOM.encode( classes ) + '" style="display:inline-block;width:24px;height:24px;font-size:20px;line-height:24px;font-style:normal;text-align:center;' + font + '"></i>'
			);
		}

		function ensureIcon( name ) {
			if ( ! scriptsLoaded ) {
				pendingIcons.push( name );
			} else if ( ! isKnownIcon( name ) ) {
				registerCssIcon( name );
			}
		}

		editor.on( 'ScriptsLoaded', function () {
			scriptsLoaded = true;
			pendingIcons.forEach( ensureIcon );
			pendingIcons = [];
		} );

		function resolveIconName( icon ) {
			var name = RENAMED_ICONS[ icon ] || icon;

			ensureIcon( name );

			return name;
		}

		function createHost( name ) {
			return { editor: editor, name: name, resolveIconName: resolveIconName };
		}

		function resolveIcon( settings ) {
			var name;

			if ( settings.image ) {
				name = 'compat4x-image-' + ( ++imageCount );
				registry.addIcon(
					name,
					'<img src="' + tinymce.DOM.encode( settings.image ) + '" alt="" width="24" height="24">'
				);
				return name;
			}

			if ( typeof settings.icon !== 'string' || ! settings.icon ) {
				return undefined;
			}

			return resolveIconName( settings.icon );
		}

		function getAction( settings, control ) {
			return function () {
				if ( settings.cmd ) {
					editor.execCommand( settings.cmd );
				} else {
					trigger( control, 'click' );
				}
			};
		}

		function createOnSetup( control ) {
			var selector = control.settings.stateSelector;

			return function ( api ) {
				var onNodeChange;

				control.bind( api );

				if ( selector ) {
					onNodeChange = function ( event ) {
						control.active( editor.dom.getParents( event.element, selector, editor.getBody() ).length > 0 );
					};
					editor.on( 'NodeChange', onNodeChange );
				}

				trigger( control, 'postrender' );

				return function () {
					if ( onNodeChange ) {
						editor.off( 'NodeChange', onNodeChange );
					}
				};
			};
		}

		function needsActiveState( settings ) {
			return !! ( settings.stateSelector || settings.selectable || 'active' in settings || getHandler( settings, 'postrender' ) );
		}

		function createMenuItemSpec( settings, onAction ) {
			var control = createControl( settings, createHost() );
			var spec = {
				text: settings.text,
				icon: resolveIcon( settings ),
				shortcut: settings.shortcut,
				onSetup: createOnSetup( control ),
			};

			if ( settings.menu ) {
				spec.type = 'nestedmenuitem';
				spec.getSubmenuItems = function () {
					return createMenuItems( settings.menu );
				};
				return spec;
			}

			spec.type = needsActiveState( settings ) ? 'togglemenuitem' : 'menuitem';
			spec.onAction = onAction ? onAction( control ) : getAction( settings, control );

			if ( 'togglemenuitem' === spec.type ) {
				spec.active = !! settings.active;
			}

			return spec;
		}

		function isSeparator( item ) {
			return item === '|' || '-' === item.text || '|' === item.text || 'separator' === item.type;
		}

		function createMenuItems( items, onAction ) {
			return items.map( function ( item ) {
				return isSeparator( item ) ? { type: 'separator' } : createMenuItemSpec( item, onAction );
			} );
		}

		function addMenuButton( name, settings, spec, onAction ) {
			var items = settings.menu || settings.values || [];

			spec.fetch = function ( callback ) {
				callback( createMenuItems( items, onAction ) );
			};
			registry.addMenuButton( name, spec );
		}

		function addListBox( name, settings, control, spec ) {
			var items = settings.values || settings.menu || [];

			items.forEach( function ( item ) {
				if ( undefined !== settings.value && item.value === settings.value ) {
					spec.text = item.text;
				}
			} );

			addMenuButton( name, settings, spec, function ( itemControl ) {
				return function () {
					control.value( itemControl.settings.value );
					control.text( itemControl.settings.text );
					trigger( itemControl, 'click' );
					trigger( control, 'select' );
				};
			} );
		}

		function addSplitButton( name, settings, control, spec ) {
			var items = settings.menu || [];

			spec.onAction = getAction( settings, control );

			// Without this, TinyMCE labels the chevron "Text color menu".
			spec.chevronTooltip = settings.tooltip || settings.text || name;
			spec.fetch = function ( callback ) {
				callback( items.map( function ( item, index ) {
					return isSeparator( item ) ?
						{ type: 'separator' } :
						{ type: 'choiceitem', text: item.text, icon: resolveIcon( item ), value: String( index ) };
				} ) );
			};
			spec.onItemAction = function ( api, value ) {
				var item = items[ Number( value ) ];

				trigger( createControl( item, createHost() ), 'click' );
			};
			registry.addSplitButton( name, spec );
		}

		function addButton( name, settings ) {
			var type = settings.type || 'button';
			var control = createControl( settings, createHost( name ) );
			var spec;

			// TinyMCE 4 used the button name as its icon when it had neither text nor an icon.
			if ( ! settings.text && ! settings.icon && ! settings.image ) {
				settings.icon = name;
			}

			settings.tooltip = settings.tooltip || settings.title;
			v4Specs.buttons[ name.toLowerCase() ] = settings;

			spec = {
				text: settings.text,
				tooltip: settings.tooltip,
				icon: resolveIcon( settings ),
				onSetup: createOnSetup( control ),
			};

			if ( 'menubutton' === type ) {
				addMenuButton( name, settings, spec );
			} else if ( 'listbox' === type ) {
				addListBox( name, settings, control, spec );
			} else if ( 'splitbutton' === type ) {
				addSplitButton( name, settings, control, spec );
			} else {
				if ( 'button' !== type ) {
					warnOnce( 'button.' + type, 'Button type "' + type + '" is not available in TinyMCE 8; "' + name + '" is rendered as a plain button.' );
				}

				spec.shortcut = settings.shortcut;
				spec.onAction = getAction( settings, control );

				if ( needsActiveState( settings ) ) {
					spec.active = !! settings.active;
					registry.addToggleButton( name, spec );
				} else {
					registry.addButton( name, spec );
				}
			}
		}

		function addToMenu( name, settings ) {
			var items = menuContexts[ settings.context ] = menuContexts[ settings.context ] || { start: [], end: [] };
			var entry = 'before' === settings.separator ? [ '|', name ] : [ name ];

			if ( settings.prependToContext ) {
				items.start = items.start.concat( entry );
			} else {
				items.end = items.end.concat( entry );
			}
		}

		// The theme reads `menu` when it renders, after every plugin has added its items.
		function shimMenuOption() {
			var options = editor.options;
			var get = options.get;

			options.get = function ( name ) {
				var value = get.apply( options, arguments );
				var menus;

				if ( 'menu' !== name || ! Object.keys( menuContexts ).length ) {
					return value;
				}

				menus = $.extend( {}, value );

				Object.keys( menuContexts ).forEach( function ( context ) {
					var base = menus[ context ] || DEFAULT_MENUS[ context ] || { title: context, items: '' };
					var items = menuContexts[ context ];

					menus[ context ] = {
						title: base.title,
						items: items.start.concat( base.items ? [ base.items ] : [], items.end ).join( ' ' ),
					};
				} );

				return menus;
			};
		}

		function addMenuItem( name, settings ) {
			var spec;

			if ( settings.context ) {
				addToMenu( name, settings );
			}

			v4Specs.menuItems[ name.toLowerCase() ] = settings;
			spec = createMenuItemSpec( settings );

			if ( 'nestedmenuitem' === spec.type ) {
				registry.addNestedMenuItem( name, spec );
			} else if ( 'togglemenuitem' === spec.type ) {
				registry.addToggleMenuItem( name, spec );
			} else {
				registry.addMenuItem( name, spec );
			}
		}

		// Reads prefer the v4 spec, so plugins see the fields they registered.
		function createRegistryView( collection, add ) {
			function entries() {
				return registry.getAll()[ collection ];
			}

			function read( name ) {
				var key = name.toLowerCase();

				return v4Specs[ collection ][ key ] || entries()[ key ];
			}

			return new Proxy( {}, {
				get: function ( target, name ) {
					return typeof name === 'string' ? read( name ) : undefined;
				},
				set: function ( target, name, value ) {
					add( name, value );
					return true;
				},
				has: function ( target, name ) {
					return typeof name === 'string' && !! read( name );
				},
				deleteProperty: function ( target, name ) {
					var key = String( name ).toLowerCase();

					delete v4Specs[ collection ][ key ];
					delete entries()[ key ];
					return true;
				},
				ownKeys: function () {
					return Object.keys( entries() );
				},
				getOwnPropertyDescriptor: function ( target, name ) {
					var value = read( String( name ) );

					return value ? { configurable: true, enumerable: true, value: value } : undefined;
				},
			} );
		}

		shimMenuOption();

		if ( ! editor.addButton ) {
			editor.addButton = function ( name, settings ) {
				warnOnce( 'addButton', 'editor.addButton() is deprecated; use editor.ui.registry.addButton().' );
				addButton( name, settings );
			};
		}

		if ( ! editor.addMenuItem ) {
			editor.addMenuItem = function ( name, settings ) {
				warnOnce( 'addMenuItem', 'editor.addMenuItem() is deprecated; use editor.ui.registry.addMenuItem().' );
				addMenuItem( name, settings );
			};
		}

		if ( ! editor.buttons ) {
			editor.buttons = createRegistryView( 'buttons', addButton );
		}

		if ( ! editor.menuItems ) {
			editor.menuItems = createRegistryView( 'menuItems', addMenuItem );
		}
	}

	function toArray( value ) {
		if ( ! value ) {
			return [];
		}

		return Array.isArray( value ) ? value : [ value ];
	}

	function addCollectionMethods( items ) {
		function each( method ) {
			return function () {
				var args = arguments;

				items.forEach( function ( item ) {
					item[ method ].apply( item, args );
				} );

				return items;
			};
		}

		// Called without arguments, value() and text() read the first item, as in TinyMCE 4.
		function accessor( method ) {
			var write = each( method );

			return function () {
				if ( arguments.length ) {
					return write.apply( null, arguments );
				}

				return items[ 0 ] ? items[ 0 ][ method ]() : undefined;
			};
		}

		items.each = function ( callback ) {
			items.forEach( function ( item, index ) {
				callback.call( item, index, item );
			} );
			return items;
		};
		items.value = accessor( 'value' );
		items.text = accessor( 'text' );
		items.disabled = accessor( 'disabled' );
		items.visible = accessor( 'visible' );
		items.show = each( 'show' );
		items.hide = each( 'hide' );

		return items;
	}

	/*
	 * Each v4 field type: its TinyMCE 8 type and how its value converts. TinyMCE 8 list boxes only
	 * take strings and URL inputs take an object, while v4 handlers expect the original values.
	 */
	var DIALOG_FIELDS = {
		textbox: { type: 'input' },
		colorbox: { type: 'colorinput' },
		colorpicker: { type: 'colorinput' },
		checkbox: { type: 'checkbox', empty: false },
		listbox: { type: 'listbox' },
		selectbox: { type: 'listbox' },
		combobox: { type: 'input' },
		filepicker: {
			type: 'urlinput',
			toDialog: function ( value ) {
				return { value: value };
			},
			fromDialog: function ( value ) {
				return value ? value.value : '';
			},
		},
	};

	var DIALOG_LAYOUTS = [ 'container', 'panel', 'form', 'fieldset', 'formitem' ];

	/*
	 * editor.windowManager.open() with a TinyMCE 4 spec: `body` or `items` as a list of v4 controls,
	 * `buttons`, `onsubmit`, or a `url`. The returned object stands in for the v4 window. The window
	 * manager is created during render, so this runs after `setup` callbacks.
	 */
	function shimWindowManager( editor ) {
		var manager = editor.windowManager;
		var openDialog = manager.open;
		var openUrlDialog = manager.openUrl;
		var windows = [];
		var counter = 0;

		function createHost( name ) {
			return { editor: editor, name: name, resolveIconName: String };
		}

		function isV8Spec( args ) {
			return !! args && !! args.body && ! Array.isArray( args.body ) &&
				( 'panel' === args.body.type || 'tabpanel' === args.body.type );
		}

		function openV4( args, params ) {
			var api = null;
			var data = args.data || {};
			var controls = [];
			var actions = {};
			var win = createControl( args, createHost() );
			var isOpen = true;

			function addControl( item, type, name, field, initial ) {
				var control = createControl( item, createHost( name ) );
				var value = initial;
				var isDisabled = !! item.disabled;

				control.type = type;
				control.isNamed = !! item.name;
				control.rootControl = win;
				control.parent = function () {
					return win;
				};
				control.parents = function () {
					return addCollectionMethods( [ win ] );
				};
				control.focus = function () {
					api.focus( name );
					return control;
				};
				control.value = function ( newValue ) {
					var current;

					if ( arguments.length ) {
						var update = {};

						value = newValue;

						if ( api && field ) {
							update[ name ] = control.toDialog( newValue );
							api.setData( update );
						}

						return control;
					}

					if ( ! api || ! field ) {
						return value;
					}

					current = api.getData()[ name ];

					return field.fromDialog ? field.fromDialog( current ) : control.restoreValue( current );
				};
				control.disabled = function ( state ) {
					if ( ! arguments.length ) {
						return isDisabled;
					}

					isDisabled = !! state;

					if ( api ) {
						api.setEnabled( name, ! isDisabled );
					}

					return control;
				};
				control.visible = function () {
					warnOnce( 'dialog.visible', 'Hiding a dialog field with visible() is not available in TinyMCE 8.' );
					return true;
				};
				control.toDialog = function ( newValue ) {
					return field && field.toDialog ? field.toDialog( newValue ) : newValue;
				};
				control.restoreValue = function ( current ) {
					return current;
				};

				controls.push( control );

				return control;
			}

			function createHtmlPanel( html, classes ) {
				var names = classes ? String( classes ).split( /\s+/ ).map( function ( name ) {
					return 'mce-' + name;
				} ).join( ' ' ) : '';

				return {
					type: 'htmlpanel',
					html: names ? '<div class="' + tinymce.DOM.encode( names ) + '">' + html + '</div>' : html,
				};
			}

			function createListItems( items, values ) {
				return items.map( function ( item ) {
					var menu = item.menu || item.items;

					if ( menu ) {
						return { text: item.text, items: createListItems( menu, values ) };
					}

					values[ String( item.value ) ] = item.value;

					return { text: item.text, value: String( item.value ) };
				} );
			}

			function firstListValue( items ) {
				var first = items[ 0 ];

				if ( ! first ) {
					return '';
				}

				return first.menu || first.items ? firstListValue( first.menu || first.items ) : first.value;
			}

			function createField( item, type, initialData ) {
				var field = DIALOG_FIELDS[ type ];
				var name = item.name || 'compat4x_field_' + ( ++counter );
				var items = item.values || item.menu || [];
				var initial = data[ item.name ];
				var values = {};
				var control;
				var spec;

				if ( undefined === initial ) {
					initial = 'checkbox' === type ? item.checked : item.value;
				}

				if ( undefined === initial ) {
					if ( 'input' === field.type || 'colorinput' === field.type || 'urlinput' === field.type ) {
						initial = '';
					} else if ( 'listbox' === field.type ) {
						initial = firstListValue( items );
					} else {
						initial = field.empty;
					}
				}

				control = addControl( item, type, name, field, initial );
				spec = { type: field.type, name: name, enabled: ! item.disabled };

				if ( 'checkbox' === field.type ) {
					spec.label = item.text || item.label || '';
				} else {
					spec.label = item.label;
				}

				if ( 'input' === field.type && item.multiline ) {
					spec.type = 'textarea';
				}

				if ( 'input' === field.type || 'textarea' === spec.type ) {
					spec.placeholder = item.placeholder;
				}

				if ( 'urlinput' === field.type ) {
					spec.filetype = item.filetype || 'file';
				}

				if ( 'listbox' === field.type ) {
					spec.items = createListItems( items, values );
					control.toDialog = String;
					control.restoreValue = function ( current ) {
						return current in values ? values[ current ] : current;
					};
				}

				initialData[ name ] = control.toDialog( initial );

				return spec;
			}

			function createItem( item, initialData ) {
				var type = item.type;
				var name;

				if ( DIALOG_FIELDS[ type ] ) {
					return createField( item, type, initialData );
				}

				if ( 'label' === type ) {
					addControl( item, type, item.name || 'compat4x_field_' + ( ++counter ), null, '' );
					return createHtmlPanel( item.html || tinymce.DOM.encode( tinymce.translate( item.text || '' ) ), item.classes );
				}

				if ( 'button' === type ) {
					name = item.name || 'compat4x_field_' + ( ++counter );
					actions[ name ] = addControl( item, type, name, null, '' );

					return {
						type: 'button',
						name: name,
						text: item.text || '',
						buttonType: 'primary' === item.subtype ? 'primary' : 'secondary',
						enabled: ! item.disabled,
					};
				}

				if ( DIALOG_LAYOUTS.indexOf( type ) > -1 ) {
					return createLayout( item, initialData );
				}

				if ( 'spacer' !== type ) {
					warnOnce( 'dialog.' + type, 'Dialog control "' + type + '" is not available in TinyMCE 8 and was skipped.' );
				}

				return null;
			}

			function createItems( items, initialData ) {
				return toArray( items ).map( function ( item ) {
					return createItem( item, initialData );
				} ).filter( Boolean );
			}

			function createLayout( item, initialData ) {
				var items;

				if ( item.html ) {
					return createHtmlPanel( item.html, item.classes );
				}

				items = createItems( item.items, initialData );

				if ( 'fieldset' === item.type && item.label ) {
					items.unshift( createHtmlPanel( '<strong>' + tinymce.DOM.encode( tinymce.translate( item.label ) ) + '</strong>' ) );
				}

				return { type: 'panel', items: items };
			}

			function createBody( initialData ) {
				var items = args.body || args.items;

				if ( 'tabpanel' === args.bodyType || ( items && 'tabpanel' === items.type ) ) {
					return {
						type: 'tabpanel',
						tabs: toArray( args.body || items.items ).map( function ( tab ) {
							return {
								title: tab.title || '',
								name: 'compat4x_tab_' + ( ++counter ),
								items: createItems( tab.items, initialData ),
							};
						} ),
					};
				}

				return { type: 'panel', items: createItems( items, initialData ) };
			}

			function createButtons( isUrl ) {
				var buttons = toArray( args.buttons );

				if ( ! buttons.length && ! isUrl ) {
					buttons = [
						{ text: 'Ok', subtype: 'primary', onclick: 'submit' },
						{ text: 'Cancel', onclick: 'close' },
					];
				}

				return buttons.map( function ( button ) {
					var name = 'compat4x_button_' + ( ++counter );
					var isPrimary = 'primary' === button.subtype;

					if ( 'submit' === button.onclick && ! isUrl ) {
						return { type: 'submit', name: name, text: button.text, primary: isPrimary };
					}

					actions[ name ] = button;

					return { type: 'custom', name: name, text: button.text, primary: isPrimary };
				} );
			}

			function runAction( name ) {
				var action = actions[ name ];
				var onclick;

				if ( ! action ) {
					return;
				}

				if ( action.fire ) {
					action.fire( 'click' );
					return;
				}

				onclick = action.onclick || action.onClick;

				if ( 'close' === onclick ) {
					win.close();
				} else if ( 'submit' === onclick ) {
					win.submit();
				} else if ( typeof onclick === 'function' ) {
					onclick.call( win, { control: win, type: 'click' } );
				}
			}

			function handleClose() {
				if ( ! isOpen ) {
					return;
				}

				isOpen = false;
				windows.splice( windows.indexOf( win ), 1 );
				win.fire( 'close' );
			}

			function handleChange( dialogApi, details ) {
				var changed = controls.filter( function ( control ) {
					return control.name() === details.name;
				} )[ 0 ];

				if ( changed ) {
					[ 'change', 'input', 'keyup', 'select' ].forEach( function ( name ) {
						changed.fire( name );
					} );
				}

				win.fire( 'change', { control: changed } );
			}

			win.params = params || {};
			win.features = args;
			win.close = function () {
				if ( api ) {
					api.close();
				}

				return win;
			};
			win.submit = function () {
				var event = win.fire( 'submit', { data: win.toJSON() } );

				if ( ! event.isDefaultPrevented() ) {
					win.close();
				}

				return event;
			};
			win.toJSON = function () {
				var result = {};

				controls.forEach( function ( control ) {
					if ( control.isNamed ) {
						result[ control.name() ] = control.value();
					}
				} );

				return result;
			};
			win.fromJSON = function ( values ) {
				controls.forEach( function ( control ) {
					if ( control.isNamed && control.name() in values ) {
						control.value( values[ control.name() ] );
					}
				} );

				return win;
			};
			win.find = function ( selector ) {
				var name = String( selector );

				// `win.find( 'form' )[ 0 ].submit()` is how v4 buttons submitted a dialog.
				if ( 'form' === name ) {
					return addCollectionMethods( [ win ] );
				}

				return addCollectionMethods( controls.filter( function ( control ) {
					if ( '*' === name ) {
						return true;
					}

					return '#' === name.charAt( 0 ) ? control.name() === name.slice( 1 ) : control.type === name;
				} ) );
			};
			win.getEl = function () {
				var dialogs = document.querySelectorAll( '.tox-dialog' );

				return dialogs[ dialogs.length - 1 ] || null;
			};
			win.getContentWindow = function () {
				var element = win.getEl();
				var iframe = element && element.querySelector( 'iframe' );

				return iframe ? iframe.contentWindow : null;
			};
			win.focus = function () {
				return win;
			};
			[ 'reflow', 'repaint', 'fit', 'moveTo', 'resizeTo', 'resizeBy' ].forEach( function ( name ) {
				win[ name ] = function () {
					return win;
				};
			} );
			Object.defineProperty( win, '$el', {
				get: function () {
					return $( win.getEl() );
				},
			} );

			function open() {
				var url = args.url || args.file;
				var width = parseInt( args.width, 10 );
				var initialData = {};
				var common = {
					title: args.title || ' ',
					onCancel: function () {
						win.fire( 'cancel' );
					},
					onClose: handleClose,
					onAction: function ( dialogApi, details ) {
						runAction( details.name );
					},
				};

				if ( url ) {
					return openUrlDialog.call( manager, $.extend( common, {
						url: url,
						width: width || 320,
						height: parseInt( args.height, 10 ) || 240,
						buttons: createButtons( true ),
					} ) );
				}

				common.body = createBody( initialData );
				common.buttons = createButtons( false );
				common.initialData = initialData;
				common.size = width >= 800 ? 'large' : ( width >= 500 ? 'medium' : 'normal' );
				common.onChange = handleChange;
				common.onSubmit = function () {
					win.submit();
				};

				return openDialog.call( manager, common );
			}

			api = open();
			windows.push( win );
			win.fire( 'postrender' );

			return win;
		}

		manager.open = function ( args, params ) {
			if ( isV8Spec( args ) ) {
				return openDialog.apply( manager, arguments );
			}

			warnOnce( 'windowManager.open', 'editor.windowManager.open() with a TinyMCE 4 dialog is deprecated; use the TinyMCE 8 dialog format.' );

			return openV4( args || {}, params );
		};

		manager.getWindows = function () {
			return windows;
		};

		manager.getParams = function () {
			var top = windows[ windows.length - 1 ];

			return top ? top.params : {};
		};

		manager.setParams = function ( params ) {
			var top = windows[ windows.length - 1 ];

			if ( top ) {
				top.params = params;
			}
		};
	}

	/*
	 * Handlers change `event.content` on SaveContent, but editor.save() in TinyMCE 8 reads its own
	 * arguments while dispatch() hands handlers a copy, so those changes would be lost.
	 */
	function shimSaveContentEvent( editor ) {
		var dispatch = editor.dispatch;

		editor.dispatch = function ( name, args ) {
			var event = dispatch.apply( editor, arguments );

			if ( args && 'savecontent' === String( name ).toLowerCase() ) {
				args.content = event.content;
			}

			return event;
		};
	}

	/*
	 * wpautop() can leave a closing </p> with no opening tag, for example after a selection marker
	 * at the start of a block. TinyMCE 4 ignored it, but the HTML parser in TinyMCE 8 turns it into
	 * an empty paragraph.
	 */
	function removeStrayParagraphEnds( content ) {
		var isOpen = false;
		var marker = '(?:<span\\b[^>]*\\bmce_SELRES_(?:start|end)\\b[^>]*>[^<]*<\\/span>)?';

		// Browsers treat these as blocks that end a paragraph, but wpautop() wraps them in one.
		var blocks = 'center|dir|listing|main|search|xmp';

		content = content
			.replace( new RegExp( '<p>(' + marker + '\\s*<(?:' + blocks + ')\\b)', 'gi' ), '$1' )
			.replace( new RegExp( '(<\\/(?:' + blocks + ')>\\s*' + marker + ')<\\/p>', 'gi' ), '$1' );

		return content.replace( /<(\/?)p(?:\s[^>]*)?>/gi, function ( tag, closing ) {
			if ( ! closing ) {
				isOpen = true;
				return tag;
			}

			if ( ! isOpen ) {
				return '';
			}

			isOpen = false;
			return tag;
		} );
	}

	/*
	 * The load and save handling from core's `wordpress` TinyMCE plugin, which is not available
	 * until it is ported. Posts are stored without <p> tags, so without this a save would change
	 * the stored format and a reload would lose the paragraphs.
	 */
	function shimWordPressContent( editor ) {
		function isActive() {
			return ! editor.plugins.wordpress;
		}

		function hasWpautop() {
			var wp = window.wp;

			return !! ( wp && wp.editor && wp.editor.autop && editor.settings.wpautop !== false );
		}

		// Public events that plugins listen to, and that core's own selection restore relies on.
		editor.on( 'ScriptsLoaded', function () {
			if ( isActive() ) {
				$( document ).triggerHandler( 'tinymce-editor-setup', [ editor ] );
			}
		} );

		editor.on( 'init', function () {
			if ( isActive() ) {
				// Core's sticky toolbar (wp/editor/dfw.js) needs the v4 chrome and throws without it.
				$( document ).off( 'tinymce-editor-init.editor-expand' );
				$( document ).triggerHandler( 'tinymce-editor-init', [ editor ] );
			}
		} );

		// Don't replace <i> with <em> and <b> with <strong>, and allow <script> in placeholders.
		editor.on( 'PreInit', function () {
			if ( isActive() ) {
				editor.schema.addValidElements(
					'@[id|accesskey|class|dir|lang|style|tabindex|title|contenteditable|draggable|dropzone|hidden|spellcheck|translate],' +
					'i,b,script[src|async|defer|type|charset|crossorigin|integrity]'
				);
			}
		} );

		// <script> and <style> are edited as placeholder images, or TinyMCE would remove them.
		function preserveScripts( content ) {
			return content.replace( /<(script|style)[^>]*>[\s\S]*?<\/\1>/g, function ( match, tag ) {
				return '<img src="' + tinymce.Env.transparentSrc + '" ' +
					'data-wp-preserve="' + encodeURIComponent( match ) + '" ' +
					'data-mce-resize="false" data-mce-placeholder="1" ' +
					'class="mce-object mce-object-' + tag + '" width="20" height="20" ' +
					'alt="&lt;' + tag + '&gt;" />';
			} );
		}

		editor.on( 'PostProcess', function ( event ) {
			if ( ! isActive() || ! event.get ) {
				return;
			}

			event.content = event.content.replace( /<img[^>]+>/g, function ( image ) {
				var match = image.match( / data-wp-preserve="([^"]+)"/ );

				return match ? decodeURIComponent( match[ 1 ] ) : image;
			} );
		} );

		editor.on( 'BeforeSetContent', function ( event ) {
			if ( ! isActive() || ! event.content ) {
				return;
			}

			if ( event.load && event.format !== 'raw' ) {
				if ( hasWpautop() ) {
					event.content = removeStrayParagraphEnds( window.wp.editor.autop( event.content ) );
				} else {
					// Prevent creation of paragraphs out of multiple HTML comments.
					event.content = event.content.replace( /-->\s+<!--/g, '--><!--' );
				}
			}

			event.content = preserveScripts( event.content );
		} );

		// Empty paragraphs are stored with &nbsp; and edited with a placeholder <br>.
		editor.on( 'SetContent', function () {
			if ( ! isActive() ) {
				return;
			}

			editor.dom.select( 'p' ).forEach( function ( node ) {
				var html = node.innerHTML;

				if ( html && html.length < 10 && ( ! html.trim() || html.trim() === '&nbsp;' ) ) {
					node.innerHTML = '<br data-mce-bogus="1">';
				}
			} );
		} );

		editor.on( 'SaveContent', function ( event ) {
			if ( ! isActive() ) {
				return;
			}

			// If the editor is hidden, the textarea holds the content being edited.
			if ( ! editor.inline && editor.isHidden() ) {
				event.content = event.element.value;
				return;
			}

			event.content = event.content.replace( /<p>(?:<br ?\/?>| |﻿| )*<\/p>/g, '<p>&nbsp;</p>' );

			if ( hasWpautop() ) {
				event.content = window.wp.editor.removep( event.content );
			} else {
				// Restore formatting of block boundaries.
				event.content = event.content.replace( /-->\s*<!-- wp:/g, '-->\n\n<!-- wp:' );
			}
		} );
	}

	function addLegacyClasses( root ) {
		Object.keys( LEGACY_CLASSES ).forEach( function ( selector ) {
			if ( root.matches( selector ) ) {
				root.classList.add( LEGACY_CLASSES[ selector ] );
			}

			root.querySelectorAll( selector ).forEach( function ( element ) {
				element.classList.add( LEGACY_CLASSES[ selector ] );
			} );
		} );
	}

	// Menus and dialogs are created on demand in these shared containers, outside the editor.
	function observeSharedContainers() {
		document.querySelectorAll( '.tox-tinymce-aux, .tox-silver-sink' ).forEach( function ( container ) {
			if ( container.compat4xObserved ) {
				return;
			}

			container.compat4xObserved = true;
			addLegacyClasses( container );

			new MutationObserver( function ( mutations ) {
				mutations.forEach( function ( mutation ) {
					mutation.addedNodes.forEach( function ( node ) {
						if ( 1 === node.nodeType ) {
							addLegacyClasses( node );
						}
					} );
				} );
			} ).observe( container, { childList: true, subtree: true } );
		} );
	}

	function shimLegacyClasses( editor ) {
		editor.on( 'init', function () {
			var container = editor.getContainer();

			if ( container ) {
				addLegacyClasses( container );
			}

			observeSharedContainers();
		} );
	}

	// SetupEditor fires right before `setup` callbacks, which AddEditor would be too late for.
	tinymce.on( 'SetupEditor', function ( event ) {
		shimDomQuery( event.editor );
		shimSettings( event.editor );
		shimThemeResize( event.editor );
		shimBookmarks( event.editor );
		shimUi( event.editor );
		event.editor.on( 'ScriptsLoaded', function () {
			shimWindowManager( event.editor );
		} );
		shimLegacyClasses( event.editor );
		shimSaveContentEvent( event.editor );
		shimWordPressContent( event.editor );
	} );

	/*
	 * Browser flags removed from tinymce.Env, with TinyMCE 4's own definitions. The IE flag is always
	 * false because TinyMCE 8 does not run on it, which core's `Env.ie && Env.ie < 11` checks allow.
	 */
	function shimEnv() {
		var env = tinymce.Env;
		var userAgent = window.navigator.userAgent;
		var isWebKit = /WebKit/.test( userAgent );
		var isGecko = ! isWebKit && /Gecko/.test( userAgent );
		var isMac = userAgent.indexOf( 'Mac' ) !== -1;
		var flags = {
			android: /Android/.test( userAgent ),
			caretAfter: true,
			ceFalse: true,
			contentEditable: true,
			desktop: env.deviceType.isDesktop(),
			experimentalShadowDom: false,
			fileApi: true,
			gecko: isGecko,
			ie: false,
			iOS: /(iPad|iPhone)/.test( userAgent ),
			mac: isMac,
			opera: false,
			overrideViewPort: null,
			range: true,
			webkit: isWebKit,
		};
		var globals = {
			isGecko: isGecko,
			isIE: false,
			isMac: isMac,
			isOpera: false,
			isWebKit: isWebKit,
		};

		Object.keys( flags ).forEach( function ( name ) {
			if ( ! ( name in env ) ) {
				env[ name ] = flags[ name ];
			}
		} );

		Object.keys( globals ).forEach( function ( name ) {
			if ( ! ( name in tinymce ) ) {
				tinymce[ name ] = globals[ name ];
			}
		} );
	}

	shimEnv();

	/*
	 * tinymce.util and tinymce.html helpers removed after TinyMCE 4. The bodies of SaxParser, Class,
	 * and the helpers they use are ported from TinyMCE 4.9.11 (LGPL 2.1) to keep their exact behavior.
	 */
	function shimUtilities() {
		var Tools = tinymce.util.Tools;
		var util = tinymce.util;
		var extendClass, initializing;

		function define( target, name, value ) {
			if ( ! ( name in target ) ) {
				target[ name ] = value;
			}
		}

		function serialize( o, quote ) {
			var i, v, t, name;

			quote = quote || '"';

			if ( o === null ) {
				return 'null';
			}

			t = typeof o;

			if ( t === 'string' ) {
				v = '\bb\tt\nn\ff\rr""\'\'\\\\';

				return quote + o.replace( /([\u0080-\uFFFF\x00-\x1f\"\'\\])/g, function ( a, b ) {
					if ( quote === '"' && a === '\'' ) {
						return a;
					}

					i = v.indexOf( b );

					if ( i + 1 ) {
						return '\\' + v.charAt( i + 1 );
					}

					a = b.charCodeAt().toString( 16 );

					return '\\u' + '0000'.substring( a.length ) + a;
				} ) + quote;
			}

			if ( t === 'object' ) {
				if ( o.hasOwnProperty && Object.prototype.toString.call( o ) === '[object Array]' ) {
					for ( i = 0, v = '['; i < o.length; i++ ) {
						v += ( i > 0 ? ',' : '' ) + serialize( o[ i ], quote );
					}

					return v + ']';
				}

				v = '{';

				for ( name in o ) {
					if ( o.hasOwnProperty( name ) && typeof o[ name ] !== 'function' ) {
						v += ( v.length > 1 ? ',' + quote : quote ) + name + quote + ':' + serialize( o[ name ], quote );
					}
				}

				return v + '}';
			}

			return '' + o;
		}

		var jsonHelper = {
			serialize: serialize,
			parse: function ( text ) {
				try {
					return JSON.parse( text );
				} catch ( ex ) {
					return undefined;
				}
			},
		};

		var jsonp = {
			callbacks: {},
			count: 0,
			send: function ( settings ) {
				var self = this;
				var dom = tinymce.DOM;
				var count = settings.count !== undefined ? settings.count : self.count;
				var id = 'tinymce_jsonp_' + count;

				self.callbacks[ count ] = function ( json ) {
					dom.remove( id );
					delete self.callbacks[ count ];
					settings.callback( json );
				};
				dom.add( dom.doc.body, 'script', { id: id, src: settings.url, type: 'text/javascript' } );
				self.count++;
			},
		};

		var xhrHelper = Tools.extend( {
			send: function ( settings ) {
				var xhr;
				var count = 0;

				function ready() {
					if ( ! settings.async || xhr.readyState === 4 || count++ > 10000 ) {
						if ( settings.success && count < 10000 && xhr.status === 200 ) {
							settings.success.call( settings.success_scope, '' + xhr.responseText, xhr, settings );
						} else if ( settings.error ) {
							settings.error.call( settings.error_scope, count > 10000 ? 'TIMED_OUT' : 'GENERAL', xhr, settings );
						}

						xhr = null;
					} else {
						setTimeout( ready, 10 );
					}
				}

				settings.scope = settings.scope || this;
				settings.success_scope = settings.success_scope || settings.scope;
				settings.error_scope = settings.error_scope || settings.scope;
				settings.async = settings.async !== false;
				settings.data = settings.data || '';

				xhrHelper.dispatch( 'beforeInitialize', { settings: settings } );

				xhr = new XMLHttpRequest();

				if ( xhr.overrideMimeType ) {
					xhr.overrideMimeType( settings.content_type );
				}

				xhr.open( settings.type || ( settings.data ? 'POST' : 'GET' ), settings.url, settings.async );

				if ( settings.crossDomain ) {
					xhr.withCredentials = true;
				}

				if ( settings.content_type ) {
					xhr.setRequestHeader( 'Content-Type', settings.content_type );
				}

				if ( settings.requestheaders ) {
					Tools.each( settings.requestheaders, function ( header ) {
						xhr.setRequestHeader( header.key, header.value );
					} );
				}

				xhr.setRequestHeader( 'X-Requested-With', 'XMLHttpRequest' );
				xhr = xhrHelper.dispatch( 'beforeSend', { xhr: xhr, settings: settings } ).xhr;
				xhr.send( settings.data );

				if ( ! settings.async ) {
					return ready();
				}

				setTimeout( ready, 10 );
			},
		}, util.Observable );

		function JSONRequest( settings ) {
			this.settings = Tools.extend( {}, settings );
			this.count = 0;
		}

		JSONRequest.sendRPC = function ( o ) {
			return new JSONRequest().send( o );
		};

		JSONRequest.prototype = {
			send: function ( args ) {
				var ecb = args.error;
				var scb = args.success;

				args = Tools.extend( this.settings, args );
				args.success = function ( c, x ) {
					c = jsonHelper.parse( c );

					if ( typeof c === 'undefined' ) {
						c = { error: 'JSON Parse error.' };
					}

					if ( c.error ) {
						ecb.call( args.error_scope || args.scope, c.error, x );
					} else {
						scb.call( args.success_scope || args.scope, c.result );
					}
				};
				args.error = function ( ty, x ) {
					if ( ecb ) {
						ecb.call( args.error_scope || args.scope, ty, x );
					}
				};
				args.data = serialize( {
					id: args.id || 'c' + this.count++,
					method: args.method,
					params: args.params,
				} );
				args.content_type = 'application/json';
				xhrHelper.send( args );
			},
		};

		function Class() {}

	Class.extend = extendClass = function (prop) {
		var self = this;
		var _super = self.prototype;
		var prototype, name, member;
		var Class = function () {
			var i, mixins, mixin;
			var self = this;
			if (!initializing) {
				if (self.init) {
					self.init.apply(self, arguments);
				}
				mixins = self.Mixins;
				if (mixins) {
					i = mixins.length;
					while (i--) {
						mixin = mixins[i];
						if (mixin.init) {
							mixin.init.apply(self, arguments);
						}
					}
				}
			}
		};
		var dummy = function () {
			return this;
		};
		var createMethod = function (name, fn) {
			return function () {
				var self = this;
				var tmp = self._super;
				var ret;
				self._super = _super[name];
				ret = fn.apply(self, arguments);
				self._super = tmp;
				return ret;
			};
		};
		initializing = true;
		prototype = new self();
		initializing = false;
		if (prop.Mixins) {
			Tools.each(prop.Mixins, function (mixin) {
				for (var name_1 in mixin) {
					if (name_1 !== 'init') {
						prop[name_1] = mixin[name_1];
					}
				}
			});
			if (_super.Mixins) {
				prop.Mixins = _super.Mixins.concat(prop.Mixins);
			}
		}
		if (prop.Methods) {
			Tools.each(prop.Methods.split(','), function (name) {
				prop[name] = dummy;
			});
		}
		if (prop.Properties) {
			Tools.each(prop.Properties.split(','), function (name) {
				var fieldName = '_' + name;
				prop[name] = function (value) {
					var self = this;
					if (value !== undefined) {
						self[fieldName] = value;
						return self;
					}
					return self[fieldName];
				};
			});
		}
		if (prop.Statics) {
			Tools.each(prop.Statics, function (func, name) {
				Class[name] = func;
			});
		}
		if (prop.Defaults && _super.Defaults) {
			prop.Defaults = Tools.extend({}, _super.Defaults, prop.Defaults);
		}
		for (name in prop) {
			member = prop[name];
			if (typeof member === 'function' && _super[name]) {
				prototype[name] = createMethod(name, member);
			} else {
				prototype[name] = member;
			}
		}
		Class.prototype = prototype;
		Class.constructor = Class;
		Class.extend = extendClass;
		return Class;
	};

	var isValidPrefixAttrName = function (name) {
		return name.indexOf('data-') === 0 || name.indexOf('aria-') === 0;
	};
	var trimComments = function (text) {
		var sanitizedText = text;
		while (/<!--|--!?>/g.test(sanitizedText)) {
			sanitizedText = sanitizedText.replace(/<!--|--!?>/g, '');
		}
		return sanitizedText;
	};
	var isInvalidUri = function (settings, uri) {
		if (settings.allow_html_data_urls) {
			return false;
		} else if (/^data:image\//i.test(uri)) {
			return settings.allow_svg_data_urls === false && /^data:image\/svg\+xml/i.test(uri);
		} else {
			return /^data:/i.test(uri);
		}
	};
	var findEndTagIndex = function (schema, html, startIndex) {
		var count = 1, index, matches, tokenRegExp, shortEndedElements;
		shortEndedElements = schema.getVoidElements();
		tokenRegExp = /<([!?\/])?([A-Za-z0-9\-_\:\.]+)((?:\s+[^"\'>]+(?:(?:"[^"]*")|(?:\'[^\']*\')|[^>]*))*|\/|\s+)>/g;
		tokenRegExp.lastIndex = index = startIndex;
		while (matches = tokenRegExp.exec(html)) {
			index = tokenRegExp.lastIndex;
			if (matches[1] === '/') {
				count--;
			} else if (!matches[1]) {
				if (matches[2] in shortEndedElements) {
					continue;
				}
				count++;
			}
			if (count === 0) {
				break;
			}
		}
		return index;
	};
	var checkBogusAttribute = function (regExp, attrString) {
		var matches = regExp.exec(attrString);
		if (matches) {
			var name = matches[1];
			var value = matches[2];
			return typeof name === 'string' && name.toLowerCase() === 'data-mce-bogus' ? value : null;
		} else {
			return null;
		}
	};
	function SaxParser(settings, schema) {
		if (schema === void 0) {
			schema = tinymce.html.Schema();
		}
		var noop = function () {
		};
		settings = settings || {};
		if (settings.fix_self_closing !== false) {
			settings.fix_self_closing = true;
		}
		var comment = settings.comment ? settings.comment : noop;
		var cdata = settings.cdata ? settings.cdata : noop;
		var text = settings.text ? settings.text : noop;
		var start = settings.start ? settings.start : noop;
		var end = settings.end ? settings.end : noop;
		var pi = settings.pi ? settings.pi : noop;
		var doctype = settings.doctype ? settings.doctype : noop;
		var parse = function (html) {
			var matches, index = 0, value, endRegExp;
			var stack = [];
			var attrList, i, textData, name;
			var isInternalElement, removeInternalElements, shortEndedElements, fillAttrsMap, isShortEnded;
			var validate, elementRule, isValidElement, attr, attribsValue, validAttributesMap, validAttributePatterns;
			var attributesRequired, attributesDefault, attributesForced, processHtml;
			var anyAttributesRequired, selfClosing, tokenRegExp, attrRegExp, specialElements, attrValue, idCount = 0;
			var decode = tinymce.html.Entities.decode;
			var fixSelfClosing;
			var filteredUrlAttrs = tinymce.util.Tools.makeMap('src,href,data,background,formaction,poster,xlink:href');
			var scriptUriRegExp = /((java|vb)script|mhtml):/i;
			var processEndTag = function (name) {
				var pos, i;
				pos = stack.length;
				while (pos--) {
					if (stack[pos].name === name) {
						break;
					}
				}
				if (pos >= 0) {
					for (i = stack.length - 1; i >= pos; i--) {
						name = stack[i];
						if (name.valid) {
							end(name.name);
						}
					}
					stack.length = pos;
				}
			};
			var parseAttribute = function (match, name, value, val2, val3) {
				var attrRule, i;
				var trimRegExp = /[\s\u0000-\u001F]+/g;
				name = name.toLowerCase();
				value = name in fillAttrsMap ? name : decode(value || val2 || val3 || '');
				if (validate && !isInternalElement && isValidPrefixAttrName(name) === false) {
					attrRule = validAttributesMap[name];
					if (!attrRule && validAttributePatterns) {
						i = validAttributePatterns.length;
						while (i--) {
							attrRule = validAttributePatterns[i];
							if (attrRule.pattern.test(name)) {
								break;
							}
						}
						if (i === -1) {
							attrRule = null;
						}
					}
					if (!attrRule) {
						return;
					}
					if (attrRule.validValues && !(value in attrRule.validValues)) {
						return;
					}
				}
				if (filteredUrlAttrs[name] && !settings.allow_script_urls) {
					var uri = value.replace(trimRegExp, '');
					try {
						uri = decodeURIComponent(uri);
					} catch (ex) {
						uri = unescape(uri);
					}
					if (scriptUriRegExp.test(uri)) {
						return;
					}
					if (isInvalidUri(settings, uri)) {
						return;
					}
				}
				if (isInternalElement && (name in filteredUrlAttrs || name.indexOf('on') === 0)) {
					return;
				}
				attrList.map[name] = value;
				attrList.push({
					name: name,
					value: value
				});
			};
			tokenRegExp = new RegExp('<(?:' + '(?:!--([\\w\\W]*?)--!?>)|' + '(?:!\\[CDATA\\[([\\w\\W]*?)\\]\\]>)|' + '(?:!DOCTYPE([\\w\\W]*?)>)|' + '(?:\\?([^\\s\\/<>]+) ?([\\w\\W]*?)[?/]>)|' + '(?:\\/([A-Za-z][A-Za-z0-9\\-_\\:\\.]*)>)|' + '(?:([A-Za-z][A-Za-z0-9\\-_\\:\\.]*)((?:\\s+[^"\'>]+(?:(?:"[^"]*")|(?:\'[^\']*\')|[^>]*))*|\\/|\\s+)>)' + ')', 'g');
			attrRegExp = /([\w:\-]+)(?:\s*=\s*(?:(?:\"((?:[^\"])*)\")|(?:\'((?:[^\'])*)\')|([^>\s]+)))?/g;
			shortEndedElements = schema.getVoidElements();
			selfClosing = settings.self_closing_elements || schema.getSelfClosingElements();
			fillAttrsMap = schema.getBoolAttrs();
			validate = settings.validate;
			removeInternalElements = settings.remove_internals;
			fixSelfClosing = settings.fix_self_closing;
			specialElements = schema.getSpecialElements();
			processHtml = html + '>';
			while (matches = tokenRegExp.exec(processHtml)) {
				if (index < matches.index) {
					text(decode(html.substr(index, matches.index - index)));
				}
				if (value = matches[6]) {
					value = value.toLowerCase();
					if (value.charAt(0) === ':') {
						value = value.substr(1);
					}
					processEndTag(value);
				} else if (value = matches[7]) {
					if (matches.index + matches[0].length > html.length) {
						text(decode(html.substr(matches.index)));
						index = matches.index + matches[0].length;
						continue;
					}
					value = value.toLowerCase();
					if (value.charAt(0) === ':') {
						value = value.substr(1);
					}
					isShortEnded = value in shortEndedElements;
					if (fixSelfClosing && selfClosing[value] && stack.length > 0 && stack[stack.length - 1].name === value) {
						processEndTag(value);
					}
					var bogusValue = checkBogusAttribute(attrRegExp, matches[8]);
					if (bogusValue !== null) {
						if (bogusValue === 'all') {
							index = findEndTagIndex(schema, html, tokenRegExp.lastIndex);
							tokenRegExp.lastIndex = index;
							continue;
						}
						isValidElement = false;
					}
					if (!validate || (elementRule = schema.getElementRule(value))) {
						isValidElement = true;
						if (validate) {
							validAttributesMap = elementRule.attributes;
							validAttributePatterns = elementRule.attributePatterns;
						}
						if (attribsValue = matches[8]) {
							isInternalElement = attribsValue.indexOf('data-mce-type') !== -1;
							if (isInternalElement && removeInternalElements) {
								isValidElement = false;
							}
							attrList = [];
							attrList.map = {};
							attribsValue.replace(attrRegExp, parseAttribute);
						} else {
							attrList = [];
							attrList.map = {};
						}
						if (validate && !isInternalElement) {
							attributesRequired = elementRule.attributesRequired;
							attributesDefault = elementRule.attributesDefault;
							attributesForced = elementRule.attributesForced;
							anyAttributesRequired = elementRule.removeEmptyAttrs;
							if (anyAttributesRequired && !attrList.length) {
								isValidElement = false;
							}
							if (attributesForced) {
								i = attributesForced.length;
								while (i--) {
									attr = attributesForced[i];
									name = attr.name;
									attrValue = attr.value;
									if (attrValue === '{$uid}') {
										attrValue = 'mce_' + idCount++;
									}
									attrList.map[name] = attrValue;
									attrList.push({
										name: name,
										value: attrValue
									});
								}
							}
							if (attributesDefault) {
								i = attributesDefault.length;
								while (i--) {
									attr = attributesDefault[i];
									name = attr.name;
									if (!(name in attrList.map)) {
										attrValue = attr.value;
										if (attrValue === '{$uid}') {
											attrValue = 'mce_' + idCount++;
										}
										attrList.map[name] = attrValue;
										attrList.push({
											name: name,
											value: attrValue
										});
									}
								}
							}
							if (attributesRequired) {
								i = attributesRequired.length;
								while (i--) {
									if (attributesRequired[i] in attrList.map) {
										break;
									}
								}
								if (i === -1) {
									isValidElement = false;
								}
							}
							if (attr = attrList.map['data-mce-bogus']) {
								if (attr === 'all') {
									index = findEndTagIndex(schema, html, tokenRegExp.lastIndex);
									tokenRegExp.lastIndex = index;
									continue;
								}
								isValidElement = false;
							}
						}
						if (isValidElement) {
							start(value, attrList, isShortEnded);
						}
					} else {
						isValidElement = false;
					}
					if (endRegExp = specialElements[value]) {
						endRegExp.lastIndex = index = matches.index + matches[0].length;
						if (matches = endRegExp.exec(html)) {
							if (isValidElement) {
								textData = html.substr(index, matches.index - index);
							}
							index = matches.index + matches[0].length;
						} else {
							textData = html.substr(index);
							index = html.length;
						}
						if (isValidElement) {
							if (textData.length > 0) {
								text(textData, true);
							}
							end(value);
						}
						tokenRegExp.lastIndex = index;
						continue;
					}
					if (!isShortEnded) {
						if (!attribsValue || attribsValue.indexOf('/') !== attribsValue.length - 1) {
							stack.push({
								name: value,
								valid: isValidElement
							});
						} else if (isValidElement) {
							end(value);
						}
					}
				} else if (value = matches[1]) {
					if (value.charAt(0) === '>') {
						value = ' ' + value;
					}
					if (!settings.allow_conditional_comments && value.substr(0, 3).toLowerCase() === '[if') {
						value = ' ' + value;
					}
					comment(value);
				} else if (value = matches[2]) {
					cdata(trimComments(value));
				} else if (value = matches[3]) {
					doctype(value);
				} else if (value = matches[4]) {
					pi(value, matches[5]);
				}
				index = matches.index + matches[0].length;
			}
			if (index < html.length) {
				text(decode(html.substr(index)));
			}
			for (i = stack.length - 1; i >= 0; i--) {
				value = stack[i];
				if (value.valid) {
					end(value.name);
				}
			}
		};
		return { parse: parse };
	}

		SaxParser.findEndTag = findEndTagIndex;

		function createNS( n, o ) {
			var i, v;

			o = o || window;
			n = n.split( '.' );

			for ( i = 0; i < n.length; i++ ) {
				v = n[ i ];

				if ( ! o[ v ] ) {
					o[ v ] = {};
				}

				o = o[ v ];
			}

			return o;
		}

		// tinymce.create( 'ns.Name:ns.Parent', { Name: constructor, method: function, static: {} } ).
		function create( s, p, root ) {
			var sp, ns, cn, scn, c;
			var de = 0;

			s = /^((static) )?([\w.]+)(:([\w.]+))?/.exec( s );
			cn = s[ 3 ].match( /(^|\.)(\w+)$/i )[ 2 ];
			ns = createNS( s[ 3 ].replace( /\.\w+$/, '' ), root );

			if ( ns[ cn ] ) {
				return;
			}

			if ( s[ 2 ] === 'static' ) {
				ns[ cn ] = p;
				return;
			}

			if ( ! p[ cn ] ) {
				p[ cn ] = function () {};
				de = 1;
			}

			ns[ cn ] = p[ cn ];
			Tools.extend( ns[ cn ].prototype, p );

			if ( s[ 5 ] ) {
				sp = Tools.resolve( s[ 5 ] ).prototype;
				scn = s[ 5 ].match( /\.(\w+)$/i )[ 1 ];
				c = ns[ cn ];

				if ( de ) {
					ns[ cn ] = function () {
						return sp[ scn ].apply( this, arguments );
					};
				} else {
					ns[ cn ] = function () {
						this.parent = sp[ scn ];
						return c.apply( this, arguments );
					};
				}

				ns[ cn ].prototype[ cn ] = ns[ cn ];

				Tools.each( sp, function ( f, n ) {
					ns[ cn ].prototype[ n ] = sp[ n ];
				} );

				Tools.each( p, function ( f, n ) {
					if ( sp[ n ] ) {
						ns[ cn ].prototype[ n ] = function () {
							this.parent = sp[ n ];
							return f.apply( this, arguments );
						};
					} else if ( n !== cn ) {
						ns[ cn ].prototype[ n ] = f;
					}
				} );
			}

			Tools.each( p.static, function ( f, n ) {
				ns[ cn ][ n ] = f;
			} );
		}

		// TinyMCE 4 defaulted to xhtml and TinyMCE 8 to html, also when these are used directly.
		[ 'Writer', 'Serializer' ].forEach( function ( name ) {
			var original = tinymce.html[ name ];

			tinymce.html[ name ] = function ( settings ) {
				var args = Array.prototype.slice.call( arguments );

				args[ 0 ] = Tools.extend( { element_format: 'xhtml' }, settings );

				return original.apply( null, args );
			};
		} );

		define( util, 'Promise', window.Promise );
		define( util, 'JSON', jsonHelper );
		define( util, 'JSONP', jsonp );
		define( util, 'XHR', xhrHelper );
		define( util, 'JSONRequest', JSONRequest );
		define( util, 'Class', Class );
		define( tinymce.html, 'SaxParser', SaxParser );
		define( tinymce.dom, 'DomQuery', $ );
		define( tinymce.dom, 'Sizzle', $.find );
		define( tinymce, 'create', create );
		define( tinymce, 'createNS', createNS );
	}

	shimUtilities();

	/*
	 * TinyMCE 4 instantiated plugins with `new`, so `tinymce.create()` classes work and a plain
	 * function can set `this.api`. TinyMCE 8 calls them without it. Arrow functions cannot be
	 * instantiated, so they keep the TinyMCE 8 call.
	 */
	function shimPluginManager() {
		var manager = tinymce.PluginManager;
		var add = manager.add;

		manager.add = function ( name, plugin, dependencies ) {
			if ( dependencies ) {
				warnOnce( 'plugin.dependencies', 'Plugin dependencies are not loaded by TinyMCE 8; load "' + name + '" dependencies separately.' );
			}

			if ( typeof plugin !== 'function' || ! plugin.prototype ) {
				return add.call( manager, name, plugin );
			}

			return add.call( manager, name, function ( editor, url ) {
				return new plugin( editor, url, editor.$ );
			} );
		};
	}

	shimPluginManager();

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
			var keep = name && (
				config.plugins.indexOf( name ) > -1 ||
				external.hasOwnProperty( name ) ||
				tinymce.PluginManager.get( name )
			);

			if ( name && ! keep && MERGED_PLUGINS.indexOf( name ) === -1 ) {
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

		// TinyMCE 4 defaulted to xhtml and TinyMCE 8 to html, which would change saved void elements.
		if ( ! settings.element_format ) {
			settings.element_format = 'xhtml';
		}

		// TinyMCE 8 would otherwise change iframes, objects, embeds, and comments in saved content.
		if ( ! ( 'sandbox_iframes' in settings ) ) {
			settings.sandbox_iframes = false;
		}

		if ( ! ( 'convert_unsafe_embeds' in settings ) ) {
			settings.convert_unsafe_embeds = false;
		}

		if ( ! ( 'allow_html_in_comments' in settings ) ) {
			settings.allow_html_in_comments = true;
		}

		// TinyMCE 8 needs a root block and warns on anything else, and it no longer reads `rtl_ui`.
		if ( 'forced_root_block' in settings && ! settings.forced_root_block ) {
			settings.forced_root_block = 'p';
			warn( '"forced_root_block" must be a block name in TinyMCE 8; using "p".' );
		}

		delete settings.rtl_ui;

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
