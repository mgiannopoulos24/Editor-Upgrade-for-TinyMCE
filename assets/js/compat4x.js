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
				var args = $.extend( { control: control, type: lowerName }, event );
				var handler = getHandler( settings, lowerName );

				if ( handler ) {
					handler.call( control, args );
				}

				( listeners[ lowerName ] || [] ).forEach( function ( listener ) {
					listener.call( control, args );
				} );

				return control;
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

	// SetupEditor fires right before `setup` callbacks, which AddEditor would be too late for.
	tinymce.on( 'SetupEditor', function ( event ) {
		shimDomQuery( event.editor );
		shimSettings( event.editor );
		shimThemeResize( event.editor );
		shimBookmarks( event.editor );
		shimUi( event.editor );
		shimSaveContentEvent( event.editor );
		shimWordPressContent( event.editor );
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
			var keep = name && (
				config.plugins.indexOf( name ) > -1 ||
				external.hasOwnProperty( name ) ||
				tinymce.PluginManager.get( name )
			);

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
