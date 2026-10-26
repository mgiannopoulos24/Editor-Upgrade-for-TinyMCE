import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectErrors, routes, setPluginState } from './helpers';

/** The block editor greets first-time users with a modal that blocks the toolbar. */
async function dismissWelcomeGuide( page: Page ) {
	for ( const name of [ 'Next', 'Get started', 'Close' ] ) {
		const button = page.getByRole( 'button', { name, exact: true } );

		if ( await button.count() ) {
			await button.first().click();
			await page.waitForTimeout( 300 );
		}
	}

	await page.keyboard.press( 'Escape' );
}

test.describe( 'Classic block', () => {
	test.beforeAll( () => setPluginState( 'classic-editor', false ) );
	test.afterAll( () => setPluginState( 'classic-editor', true ) );

	test( 'boots TinyMCE 8 inside the block editor', async ( { page } ) => {
		const errors = collectErrors( page );

		await page.goto( routes.postNew );

		const canvas = page.frameLocator( 'iframe[name="editor-canvas"]' );
		await canvas.locator( 'body.block-editor-iframe__body' ).waitFor( { timeout: 30_000 } );
		await dismissWelcomeGuide( page );

		await page.getByRole( 'button', { name: 'Block Inserter' } ).first().click();
		await page.locator( '.block-editor-inserter__search input[type="search"]' ).fill( 'Classic' );
		await page.locator( '.block-editor-block-types-list__item', { hasText: 'Classic' } ).first().click();
		await canvas.getByRole( 'button', { name: 'Edit contents' } ).click();

		const editor = page.locator( '.tox-tinymce' );
		await expect( editor ).toBeVisible();

		const frame = page.frameLocator( '.tox-edit-area iframe' );
		await frame.locator( 'body' ).click();
		await page.keyboard.type( 'Classic block smoke test.' );

		await page.getByRole( 'button', { name: 'Save', exact: true } ).last().click();
		await expect( canvas.locator( '.wp-block-freeform' ) ).toContainText( 'Classic block smoke test.' );

		expect( errors ).toEqual( [] );
	} );
} );
