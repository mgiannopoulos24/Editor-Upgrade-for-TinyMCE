import { test, expect } from '@playwright/test';
import { collectErrors, routes } from '../utils/page';
import { setPluginState } from '../utils/wp-cli';

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
		// Firefox can drop keys typed right after a click in the iframe, with TinyMCE 4 as well.
		await page.evaluate( () => window.tinymce.get( 'content' ).focus() );
		await page.keyboard.type( 'Smoke test' );

		await page.locator( '#content-html' ).click();
		await expect( page.locator( '#content' ) ).toHaveValue( 'Smoke test' );

		await page.locator( '#content-tmce' ).click();
		await expect( frame.locator( 'body' ) ).toContainText( 'Smoke test' );

		expect( errors ).toEqual( [] );
	} );

	test( 'the distraction-free button shows its icon and toggles the mode', async ( { page } ) => {
		const errors = collectErrors( page );
		const button = page.locator( '[data-mce-name="dfw"]' );

		await page.goto( routes.postNew );
		await expect( button ).toBeVisible();
		await expect( button.locator( 'i' ) ).toHaveCSS( 'font-family', /dashicons/ );

		await button.click();
		await expect( page.locator( 'body' ) ).toHaveClass( /focus-on/ );
		await expect( button ).toHaveAttribute( 'aria-pressed', 'true' );

		await page.evaluate( () => window.tinymce.get( 'content' ).execCommand( 'wpToggleDFW' ) );
		await expect( page.locator( 'body' ) ).not.toHaveClass( /focus-on/ );

		expect( errors ).toEqual( [] );
	} );
} );
