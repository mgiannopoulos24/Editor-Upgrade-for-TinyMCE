import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { collectErrors, routes } from '../utils/page';
import { setPluginState } from '../utils/wp-cli';

/**
 * Runs the code in MIGRATION.md so the guide cannot go out of date. ```js blocks are TinyMCE 8 code
 * and must not rely on compat4x. ```js v4 blocks are TinyMCE 4 code and must work through it.
 */
const GUIDE = fs.readFileSync( path.join( __dirname, '..', '..', '..', 'MIGRATION.md' ), 'utf8' );

const blocks = [ ...GUIDE.matchAll( /^```js( v4)?\n([\s\S]*?)^```$/gm ) ].map( ( match, index ) => ( {
	index,
	isV4: Boolean( match[ 1 ] ),
	code: match[ 2 ],
} ) );

function findNames( code: string, pattern: RegExp ) {
	return [ ...new Set( [ ...code.matchAll( pattern ) ].map( ( match ) => match[ 1 ] ) ) ];
}

// The TinyMCE 4 methods a TinyMCE 8 example must not use.
const V4_METHODS = [ 'addButton', 'addMenuItem', 'addContextToolbar', 'addSidebar', 'setMode', 'getLang', 'execCallback' ];

test.describe( 'MIGRATION.md', () => {
	test.beforeAll( () => setPluginState( 'classic-editor', true ) );

	test( 'has examples of both kinds', () => {
		expect( blocks.filter( ( block ) => block.isV4 ).length ).toBeGreaterThan( 5 );
		expect( blocks.filter( ( block ) => ! block.isV4 ).length ).toBeGreaterThan( 5 );
	} );

	for ( const { index, isV4, code } of blocks ) {
		const firstLine = code.split( '\n' )[ 0 ].slice( 0, 50 );

		test( `${ isV4 ? 'TinyMCE 4' : 'TinyMCE 8' } example ${ index }: ${ firstLine }`, async ( { page } ) => {
			const errors = collectErrors( page );
			const buttons = findNames( code, /(?:addButton|addToggleButton|addMenuButton)\(\s*'(\w+)'/g );
			const commands = findNames( code, /addCommand\(\s*'(\w+)'/g );

			await page.goto( routes.postNew );
			await page.waitForFunction( () => window.tinymce.get( 'content' )?.initialized );

			const failure = await page.evaluate(
				async ( args ) => {
					const textarea = document.createElement( 'textarea' );

					textarea.id = 'guide-example';
					document.querySelector( '#wpbody-content' )?.prepend( textarea );

					try {
						const [ editor ] = await window.tinymce.init( {
							selector: '#guide-example',
							toolbar: args.buttons.join( ' ' ) || 'bold',
							setup( instance ) {
								const target = instance as unknown as Record<string, unknown>;
								const originals = args.v4Methods.map( ( name ) => target[ name ] );

								// A TinyMCE 8 example cannot fall back on compat4x while it runs. Core's own
								// listeners call these later in setup, so they are only blocked during the call.
								if ( ! args.isV4 && ! args.code.includes( 'isModern' ) ) {
									args.v4Methods.forEach( ( name ) => {
										target[ name ] = () => {
											throw new Error( `The example uses editor.${ name }().` );
										};
									} );
								}

								try {
									// eslint-disable-next-line no-new-func
									new Function( 'editor', args.code )( instance );
								} finally {
									args.v4Methods.forEach( ( name, position ) => {
										target[ name ] = originals[ position ];
									} );
								}
							},
						} );

						for ( const command of args.commands ) {
							editor.execCommand( command );
						}

						return null;
					} catch ( error ) {
						return String( error );
					}
				},
				{ code, isV4, commands, buttons, v4Methods: V4_METHODS }
			);

			expect( failure ).toBeNull();

			const toolbar = page.locator( '#wpbody-content .tox-tinymce' ).first();

			for ( const button of buttons ) {
				await expect( toolbar.locator( `[data-mce-name="${ button }"]` ) ).toBeVisible();
			}

			if ( code.includes( 'windowManager.open' ) ) {
				await expect( page.locator( '.tox-dialog' ) ).toBeVisible();
				await expect( page.locator( '.tox-dialog input' ).first() ).toHaveValue( 'World' );
				await page.locator( '.tox-dialog' ).getByRole( 'button', { name: /^(ok|insert)$/i } ).click();
				await expect( page.locator( '.tox-dialog' ) ).toBeHidden();

				const content = await page.evaluate( () => window.tinymce.get( 'guide-example' ).getContent() );

				expect( content ).toContain( 'Hello World' );
			}

			expect( errors ).toEqual( [] );
		} );
	}
} );
