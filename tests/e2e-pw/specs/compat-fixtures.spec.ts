import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { collectErrors, routes } from '../utils/page';
import { setPluginState } from '../utils/wp-cli';

/**
 * Plugin Phase 2 gate: small plugins written against the TinyMCE 4 API, one API each, loaded through
 * mce_external_plugins. The expected values come from running the same plugins on real TinyMCE 4:
 * `bun run test:compat:record` deactivates this plugin and rewrites tests/compat/v4-results.json.
 */
const COMPAT_DIR = path.join( __dirname, '..', '..', 'compat' );
const RESULTS_FILE = path.join( COMPAT_DIR, 'v4-results.json' );
const RECORDING = Boolean( process.env.COMPAT_RECORD );

const fixtures = fs
	.readdirSync( path.join( COMPAT_DIR, 'plugins' ) )
	.map( ( file ) => path.basename( file, '.js' ) )
	.sort();

const expected: Record<string, unknown> = fs.existsSync( RESULTS_FILE )
	? JSON.parse( fs.readFileSync( RESULTS_FILE, 'utf8' ) )
	: {};

/** Saved after each test, because a failing test restarts the worker. */
function record( name: string, result: unknown ) {
	const results = fs.existsSync( RESULTS_FILE ) ? JSON.parse( fs.readFileSync( RESULTS_FILE, 'utf8' ) ) : {};

	results[ name ] = result;
	fs.writeFileSync( RESULTS_FILE, JSON.stringify( results, null, '\t' ) + '\n' );
}

async function runFixture( page: Page, name: string ) {
	await page.goto( `${ routes.postNew }&compat_fixtures=${ name }` );
	await page.waitForFunction( () => window.tinymce?.get( 'content' )?.initialized );

	const labels = await page.evaluate( ( fixture ) => window.compatClicks[ fixture ], name );

	if ( labels ) {
		await page.getByRole( 'button', { name: labels[ 0 ] } ).first().click();

		if ( labels[ 1 ] ) {
			await page.getByRole( 'menuitem', { name: labels[ 1 ] } ).or( page.getByRole( 'option', { name: labels[ 1 ] } ) ).first().click( { force: true } );
		}
	}

	await page.waitForFunction( ( fixture ) => fixture in window.compatResults, name, { timeout: 10_000 } );

	return page.evaluate( ( fixture ) => window.compatResults[ fixture ], name );
}

test.describe( 'Compatibility fixtures', () => {
	test.beforeAll( () => {
		setPluginState( 'classic-editor', true );

		if ( RECORDING ) {
			setPluginState( 'editor-upgrade-for-tinymce', false );
		}
	} );

	test.afterAll( () => {
		if ( RECORDING ) {
			setPluginState( 'editor-upgrade-for-tinymce', true );
		}
	} );

	for ( const name of fixtures ) {
		test( name, async ( { page } ) => {
			const errors = collectErrors( page );
			const result = await runFixture( page, name );

			if ( RECORDING ) {
				record( name, result );
				return;
			}

			expect( result ).toEqual( expected[ name ] );
			expect( errors ).toEqual( [] );
		} );
	}

	test( 'every fixture loads together without a fatal error', async ( { page } ) => {
		test.skip( RECORDING );

		const errors = collectErrors( page );

		await page.goto( `${ routes.postNew }&compat_fixtures=all` );
		await page.waitForFunction( () => window.tinymce?.get( 'content' )?.initialized );

		expect( await page.evaluate( () => window.tinymce.majorVersion ) ).toBe( '8' );

		const loaded = await page.evaluate( () => Object.keys( window.tinymce.get( 'content' ).plugins ) );

		expect( loaded ).toEqual( expect.arrayContaining( fixtures.map( ( name ) => `compat_${ name }` ) ) );
		expect( errors ).toEqual( [] );
	} );
} );
