import { test, expect } from '@playwright/test';
import { collectErrors, routes } from '../utils/page';
import { getPostContent, setPluginState } from '../utils/wp-cli';

/** Emulated phones. These run a real engine at phone size, but they are not real devices. */
test.describe( 'Classic editor on a phone', () => {
	test.beforeAll( () => setPluginState( 'classic-editor', true ) );

	test( 'boots, accepts text, switches tabs, and saves', async ( { page } ) => {
		const errors = collectErrors( page );

		await page.goto( routes.postNew );
		await expect( page.locator( '.tox-tinymce' ) ).toBeVisible();
		await page.waitForFunction( () => window.tinymce.get( 'content' )?.initialized );

		await page.evaluate( () => window.tinymce.get( 'content' ).focus() );
		await page.keyboard.type( 'Phone text' );

		await page.locator( '#content-html' ).click();
		await expect( page.locator( '#content' ) ).toHaveValue( 'Phone text' );
		await page.locator( '#content-tmce' ).click();
		await expect( page.frameLocator( '#content_ifr' ).locator( 'body' ) ).toContainText( 'Phone text' );

		await page.locator( '#title' ).fill( 'Phone' );
		await Promise.all( [ page.waitForNavigation(), page.locator( '#save-post' ).click() ] );

		expect( getPostContent( await page.locator( '#post_ID' ).inputValue() ) ).toBe( 'Phone text' );
		expect( errors ).toEqual( [] );
	} );

	test( 'the editor fits the screen, and a dialog opens', async ( { page } ) => {
		await page.goto( routes.postNew );
		await expect( page.locator( '.tox-tinymce' ) ).toBeVisible();
		await page.waitForFunction( () => window.tinymce.get( 'content' )?.initialized );

		const widths = await page.locator( '.tox-tinymce' ).evaluate( ( editor ) => ( {
			editor: editor.getBoundingClientRect().right,
			viewport: window.innerWidth,
		} ) );

		expect( widths.editor ).toBeLessThanOrEqual( widths.viewport );

		await page.evaluate( () => {
			window.tinymce.get( 'content' ).windowManager.open( { title: 'X', body: [ { type: 'textbox', name: 'a', label: 'A' } ] } );
		} );

		const dialog = page.locator( '.tox-dialog' );

		await expect( dialog ).toBeVisible();
		await dialog.getByRole( 'button', { name: 'Cancel' } ).click();
		await expect( dialog ).toBeHidden();
	} );
} );
