import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { collectErrors } from '../utils/page';
import { setPluginState } from '../utils/wp-cli';

/** The surfaces in the test-editor-surfaces skill that need tests/e2e-pw/mu-plugins/editor-surfaces.php. */
test.describe( 'Editor surfaces', () => {
	test.beforeAll( () => setPluginState( 'classic-editor', true ) );

	for ( const mode of [ 'default', 'teeny' ] ) {
		test( `front-end wp_editor(): ${ mode }`, async ( { page } ) => {
			const errors = collectErrors( page );

			await page.goto( `/?eu_test_editor=${ mode }` );
			await expect( page.locator( '.tox-tinymce' ) ).toBeVisible();
			await page.waitForFunction( () => window.tinymce.get( 'euTestEditor' )?.initialized );

			const state = await page.evaluate( () => {
				const editor = window.tinymce.get( 'euTestEditor' );

				editor.focus();

				return { major: window.tinymce.majorVersion, content: editor.getContent() };
			} );

			expect( state ).toEqual( { major: '8', content: '<p>Front end</p>' } );

			await page.keyboard.type( 'Typed. ' );

			expect( await page.evaluate( () => window.tinymce.get( 'euTestEditor' ).getContent() ) ).toContain( 'Typed.' );
			expect( errors ).toEqual( [] );
		} );
	}

	test.describe( 'Text widget', () => {
		test.afterAll( () => {
			execSync( 'bunx wp-env run cli wp theme activate twentytwentyfive', { stdio: 'ignore' } );
		} );

		test.beforeAll( () => {
			execSync( 'bunx wp-env run cli wp option delete widget_text sidebars_widgets', { stdio: 'ignore' } );
			execSync( 'bunx wp-env run cli wp widget add text eu-test-sidebar 1 --title=Fixture --text=Hello --filter=1 --visual=1', {
				stdio: 'ignore',
			} );
		} );

		test( 'boots on the classic widgets screen', async ( { page } ) => {
			const errors = collectErrors( page );

			await page.goto( '/wp-admin/widgets.php' );

			const widget = page.locator( '#eu-test-sidebar .widget' ).first();

			await widget.locator( '.widget-top' ).click();
			await expect( widget.locator( '.tox-tinymce' ) ).toBeVisible();
			await expect( widget.frameLocator( '.tox-edit-area iframe' ).locator( 'body' ) ).toContainText( 'Hello' );
			expect( errors ).toEqual( [] );
		} );

		test( 'boots in the Customizer, with dialogs above its UI', async ( { page } ) => {
			const errors = collectErrors( page );

			// Block themes have no widgets panel in the Customizer, and it only offers sidebars the theme renders.
			execSync( 'bunx wp-env run cli wp theme activate twentytwentyone', { stdio: 'ignore' } );
			execSync( 'bunx wp-env run cli wp widget add text sidebar-1 1 --title=Fixture --text=Hello --filter=1 --visual=1', {
				stdio: 'ignore',
			} );

			await page.goto( '/wp-admin/customize.php' );
			await page.waitForFunction( () => window.wp.customize?.section?.( 'sidebar-widgets-sidebar-1' )?.active() );

			await page.evaluate( () => {
				window.wp.customize.section( 'sidebar-widgets-sidebar-1' ).expand( { duration: 0 } );
			} );

			const widget = page.locator( '#sub-accordion-section-sidebar-widgets-sidebar-1 .customize-control-widget_form' ).first();

			await widget.locator( '.widget-top' ).click();
			await expect( widget.locator( '.tox-tinymce' ) ).toBeVisible();
			await expect( page.locator( '.tox-tinymce-aux' ).first() ).toHaveCSS( 'z-index', '500001' );
			await expect( widget.frameLocator( '.tox-edit-area iframe' ).locator( 'body' ) ).toContainText( 'Hello' );

			// WebKit rejects two flags in the sandbox of core's Customizer preview iframe.
			expect( errors.filter( ( error ) => ! error.includes( "'sandbox' attribute" ) ) ).toEqual( [] );
		} );
	} );
} );
