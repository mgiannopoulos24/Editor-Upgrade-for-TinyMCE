import { test, expect } from '@playwright/test';
import { collectErrors, routes, setPluginState } from './helpers';

test.describe( 'Classic editor', () => {
	test.beforeAll( () => setPluginState( 'classic-editor', true ) );

	test( 'boots TinyMCE 8 and switches between Visual and Code', async ( { page } ) => {
		const errors = collectErrors( page );

		await page.goto( routes.postNew );
		await expect( page.locator( '.tox-tinymce' ) ).toBeVisible();

		// WordPress must load the bundled v8, not core's 4.9.11.
		expect( await page.evaluate( () => window.tinymce.majorVersion ) ).toBe( '8' );

		// The plugin must keep the GPL license valid and remove a conflicting API key.
		const settings = await page.evaluate( () => {
			const editor = window.tinymce.get( 'content' );

			return { license: editor.settings.license_key, apiKey: editor.settings.api_key };
		} );
		expect( settings.license ).toBe( 'gpl' );
		expect( settings.apiKey ).toBeUndefined();

		// TinyMCE 4 called this button `formatselect`; v8 calls it `blocks`.
		await expect( page.locator( '.tox-toolbar button' ).filter( { hasText: 'Paragraph' } ) ).toBeVisible();

		const frame = page.frameLocator( '.tox-edit-area iframe' );
		await frame.locator( 'body' ).click();
		await page.keyboard.type( 'Smoke test' );

		await page.locator( '#content-html' ).click();
		await expect( page.locator( '#content' ) ).toHaveValue( '<p>Smoke test</p>' );

		await page.locator( '#content-tmce' ).click();
		await expect( frame.locator( 'body' ) ).toContainText( 'Smoke test' );

		expect( errors ).toEqual( [] );
	} );
} );
