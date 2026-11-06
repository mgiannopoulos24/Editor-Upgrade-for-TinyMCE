import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { routes } from '../utils/page';
import { setPluginState } from '../utils/wp-cli';

const V4_API: Record<string, string[]> = JSON.parse(
	fs.readFileSync( path.join( __dirname, '..', 'utils', 'v4-api.json' ), 'utf8' )
);

/** Each unsupported API, the code that uses it, and the debug message it must log. */
const UNSUPPORTED: Record<string, { code: string; message: string }> = {
	'tinymce.util.Color': { code: 'tinymce.util.Color;', message: 'tinymce.util.Color is not available' },
	'tinymce.util.I18n.data': { code: 'tinymce.util.I18n.data;', message: 'tinymce.util.I18n.data is not available' },
	'tinymce.InlineWindowManager': { code: 'tinymce.InlineWindowManager;', message: 'tinymce.InlineWindowManager is not available' },
	'tinymce.WPWindowManager': { code: 'tinymce.WPWindowManager;', message: 'tinymce.WPWindowManager is not available' },
	'editor.theme.panel': { code: 'editor.theme.panel;', message: 'editor.theme.panel is not available' },
	'editor.parser.filterNode': { code: 'editor.parser.filterNode;', message: 'editor.parser.filterNode() is not available' },
	'windowManager.parent': { code: 'editor.windowManager.parent;', message: 'editor.windowManager.parent is not available' },
	'controlManager.createButton': { code: 'editor.controlManager.createButton();', message: 'editor.controlManager cannot create controls' },
	'TinyMCE 3 events': { code: 'editor.onKeyUp.add( function () {} );', message: 'TinyMCE 3 events' },
	'PluginManager.addComponents': { code: 'tinymce.PluginManager.addComponents( "x", [] );', message: 'addComponents() has no effect' },
	'PluginManager.add dependencies': { code: 'tinymce.PluginManager.add( "compatdeps", function () {}, [ "x" ] );', message: 'Plugin dependencies are not loaded' },
	createControl: {
		code: `tinymce.PluginManager.add( 'compatv3', function () { this.createControl = function () {}; } );
			tinymce.PluginManager.get( 'compatv3' )( editor, '' );`,
		message: 'createControl()',
	},
	'tinymce.ui control': { code: 'new tinymce.ui.Control( {} );', message: 'tinymce.ui controls are deprecated' },
	'tinymce.ui rendering': { code: 'new tinymce.ui.Window( {} ).renderTo();', message: 'do not render in TinyMCE 8' },
	'unknown button type': { code: 'editor.addButton( "compat_type", { type: "colorbutton" } );', message: 'Button type "colorbutton" is not available' },
	'addButton deprecation': { code: 'editor.addButton( "compat_b", { text: "x" } );', message: 'editor.addButton() is deprecated' },
	'addMenuItem deprecation': { code: 'editor.addMenuItem( "compat_m", { text: "x" } );', message: 'editor.addMenuItem() is deprecated' },
	'v4 dialog deprecation': { code: 'editor.windowManager.open( { title: "x", body: [] } ).close();', message: 'windowManager.open() with a TinyMCE 4 dialog is deprecated' },
	'dialog size': { code: 'editor.windowManager.open( { title: "x", width: 900, height: 500, body: [] } ).close();', message: 'dialogs size to their content' },
	'dialog field visible()': {
		code: `var win = editor.windowManager.open( { title: 'x', body: [ { type: 'textbox', name: 'a' } ] } );
			win.find( '#a' )[ 0 ].visible( false );
			win.close();`,
		message: 'Hiding a dialog field',
	},
	'unknown dialog control': {
		code: 'editor.windowManager.open( { title: "x", body: [ { type: "nope" } ] } ).close();',
		message: 'Dialog control "nope" is not available',
	},
	'menu item getEl()': {
		code: `editor.addMenuItem( 'compat_el', { text: 'x', onPostRender: function () {} } );
			var item = editor.ui.registry.getAll().menuItems.compat_el;
			item.onSetup( { isEnabled: function () { return true; }, setEnabled: function () {} } );
			var control;
			editor.addMenuItem( 'compat_el2', { text: 'x', onPostRender: function () { control = this; } } );
			editor.ui.registry.getAll().menuItems.compat_el2.onSetup( { setEnabled: function () {} } );
			control.getEl();`,
		message: 'getEl() only works for toolbar buttons',
	},
};

/** Run code with `editor` in scope, and return what compat4x logged while it ran. */
function runAndCollectWarnings( page: Page, code: string ) {
	return page.evaluate( ( source ) => {
		const warnings: string[] = [];
		const original = window.console.warn;

		window.console.warn = ( ...args: unknown[] ) => warnings.push( args.join( ' ' ) );

		try {
			// eslint-disable-next-line no-new-func
			new Function( 'editor', source )( window.tinymce.get( 'content' ) );
		} finally {
			window.console.warn = original;
		}

		return warnings;
	}, code );
}

let logged: string[] = [];

test.describe( 'compat4x: the v4 API is accounted for', () => {
	test.beforeAll( () => setPluginState( 'classic-editor', true ) );

	test.beforeEach( async ( { page } ) => {
		// Warnings fire once per page, and core's own dfw.js already calls editor.addButton() on load.
		logged = [];
		page.on( 'console', ( entry ) => logged.push( entry.text() ) );

		await page.goto( routes.postNew );
		await expect( page.locator( '.tox-tinymce' ) ).toBeVisible();
		await page.waitForFunction( () => window.tinymce.get( 'content' )?.initialized );
	} );

	test( 'every name in the TinyMCE 4 API still exists', async ( { page } ) => {
		const missing = await page.evaluate( ( api ) => {
			const tinymce = window.tinymce as unknown as Record<string, Record<string, unknown>>;
			const editor = window.tinymce.get( 'content' ) as unknown as Record<string, unknown>;

			function resolve( label: string ): unknown {
				const [ root, ...rest ] = label.split( '.' );
				const start: unknown = {
					tinymce,
					editor,
					util: tinymce.util,
					dom: tinymce.dom,
					html: tinymce.html,
					geom: tinymce.geom,
				}[ root ];

				return rest.reduce( ( value: unknown, key ) => {
					if ( 'tinymce' === root && 'DOM' === key ) {
						return tinymce.DOM;
					}

					return value ? ( value as Record<string, unknown> )[ key ] : value;
				}, start );
			}

			function has( target: object, name: string ) {
				let current: object | null = target;

				while ( current ) {
					if ( Object.getOwnPropertyDescriptor( current, name ) ) {
						return true;
					}

					current = Object.getPrototypeOf( current );
				}

				return false;
			}

			const result: string[] = [];

			Object.entries( api ).forEach( ( [ label, names ] ) => {
				const target = resolve( label );

				names.forEach( ( name ) => {
					if ( ! target || ! has( target as object, name ) ) {
						result.push( `${ label }.${ name }` );
					}
				} );
			} );

			return result;
		}, V4_API );

		expect( missing ).toEqual( [] );
	} );

	for ( const [ name, { code, message } ] of Object.entries( UNSUPPORTED ) ) {
		test( `logs a message: ${ name }`, async ( { page } ) => {
			const warnings = await runAndCollectWarnings( page, code );

			expect( [ ...logged, ...warnings ].join( '\n' ) ).toContain( message );
		} );
	}

	test( 'a toolbar item with no button logs a message', async ( { page } ) => {
		const warnings = await page.evaluate( async () => {
			const messages: string[] = [];
			const original = window.console.warn;
			const textarea = document.createElement( 'textarea' );

			window.console.warn = ( ...args: unknown[] ) => messages.push( args.join( ' ' ) );
			textarea.id = 'unknown-item';
			document.querySelector( '#wpbody-content' )?.prepend( textarea );

			const [ editor ] = await window.tinymce.init( { selector: '#unknown-item', toolbar: 'bold compat_nope' } );

			window.console.warn = original;
			editor.remove();

			return messages;
		} );

		expect( warnings.join( '\n' ) ).toContain( 'Toolbar item "compat_nope" is not registered' );
		expect( warnings.join( '\n' ) ).not.toContain( 'Toolbar item "bold"' );
	} );
} );
