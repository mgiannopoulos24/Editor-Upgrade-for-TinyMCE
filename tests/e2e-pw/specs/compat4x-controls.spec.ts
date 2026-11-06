import { test, expect } from '@playwright/test';
import { collectErrors, routes } from '../utils/page';
import { UI_PROBE_SOURCE, V4_UI_LOG } from '../utils/v4-ui-probe';
import { setPluginState } from '../utils/wp-cli';

test.describe( 'compat4x: tinymce.ui', () => {
	test.beforeAll( () => setPluginState( 'classic-editor', true ) );

	test.beforeEach( async ( { page } ) => {
		await page.goto( routes.postNew );
		await expect( page.locator( '.tox-tinymce' ) ).toBeVisible();
		await page.waitForFunction( () => window.tinymce.get( 'content' )?.initialized );
	} );

	test( 'the API matches the output recorded from TinyMCE 4', async ( { page } ) => {
		const errors = collectErrors( page );

		await page.addScriptTag( { content: UI_PROBE_SOURCE } );

		expect( await page.evaluate( () => window.uiProbe() ) ).toEqual( V4_UI_LOG );
		expect( errors ).toEqual( [] );
	} );

	test( 'FloatPanel.hideAll() closes an open menu', async ( { page } ) => {
		await page.locator( '[data-mce-name="blocks"]' ).click();
		await expect( page.locator( '.tox-menu' ) ).toBeVisible();

		await page.evaluate( () => window.tinymce.ui.FloatPanel.hideAll() );

		await expect( page.locator( '.tox-menu' ) ).toHaveCount( 0 );
	} );

	test( 'menus and dialogs sit above the admin bar, and FloatPanel.zIndex moves them', async ( { page } ) => {
		const sink = page.locator( '.tox-tinymce-aux' ).first();

		await expect( sink ).toHaveCSS( 'z-index', '100100' );

		await page.evaluate( () => {
			window.tinymce.ui.FloatPanel.zIndex = 500001;
		} );

		await expect( sink ).toHaveCSS( 'z-index', '500001' );
	} );

	test( 'MessageBox opens a TinyMCE dialog and runs its callback', async ( { page } ) => {
		await page.evaluate( () => {
			window.compat4xLog = [];
			window.tinymce.ui.MessageBox.confirm( 'Sure?', ( state: boolean ) => {
				window.compat4xLog.push( String( state ) );
			} );
		} );

		const dialog = page.locator( '.tox-dialog' );

		await expect( dialog ).toContainText( 'Sure?' );
		await dialog.getByRole( 'button', { name: 'Yes' } ).click();
		await expect( dialog ).toBeHidden();

		expect( await page.evaluate( () => window.compat4xLog ) ).toEqual( [ 'true' ] );
	} );

	test( 'a plugin that extends tinymce.ui at load time keeps its working parts', async ( { page } ) => {
		const errors = collectErrors( page );

		const result = await page.evaluate( async () => {
			const textarea = document.createElement( 'textarea' );

			textarea.id = 'ui-plugin';
			document.querySelector( '#wpbody-content' )?.prepend( textarea );

			window.tinymce.ui.Factory.add( 'fixturepreview', window.tinymce.ui.Control.extend( {
				renderHtml() {
					return '<div>preview</div>';
				},
			} ) );

			window.tinymce.PluginManager.add( 'compat4xuiplugin', function ( editor: TinyMCEEditor ) {
				editor.addButton( 'fixture_preview', { type: 'fixturepreview' } );
				editor.addButton( 'fixture_working', { text: 'Still works' } );
			} );

			await window.tinymce.init( {
				selector: '#ui-plugin',
				plugins: 'compat4xuiplugin',
				toolbar: 'fixture_preview fixture_working',
			} );
		} );

		expect( result ).toBeUndefined();
		await expect( page.getByRole( 'button', { name: 'Still works' } ) ).toBeVisible();
		expect( errors ).toEqual( [] );
	} );
} );
