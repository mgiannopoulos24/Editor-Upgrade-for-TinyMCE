import { test, expect } from '@playwright/test';
import { routes } from '../utils/page';
import { V4_ENV } from '../utils/v4-baseline';
import { setPluginState } from '../utils/wp-cli';

test.describe( 'compat4x: tinymce.Env and browser flags', () => {
	test.beforeAll( () => setPluginState( 'classic-editor', true ) );

	test( 'match the values recorded from TinyMCE 4', async ( { page, browserName } ) => {
		const expected = V4_ENV[ browserName ];

		await page.goto( routes.postNew );
		await expect( page.locator( '#content_ifr' ) ).toBeAttached();

		const actual = await page.evaluate( ( names ) => {
			const pick = ( source: object, keys: string[] ) =>
				Object.fromEntries( keys.map( ( key ) => [ key, source[ key as keyof typeof source ] ] ) );

			return {
				env: pick( window.tinymce.Env, names.env ),
				globals: pick( window.tinymce, names.globals ),
			};
		}, { env: Object.keys( expected.env ), globals: Object.keys( expected.globals ) } );

		expect( actual ).toEqual( expected );
	} );

	test( 'keep the TinyMCE 8 helpers', async ( { page } ) => {
		await page.goto( routes.postNew );
		await expect( page.locator( '#content_ifr' ) ).toBeAttached();

		expect( await page.evaluate( () => window.tinymce.Env.browser.isIE() ) ).toBe( false );
	} );
} );
