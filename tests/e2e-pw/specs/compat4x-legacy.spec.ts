import { test, expect, type Page } from '@playwright/test';
import { collectErrors, routes } from '../utils/page';
import { setPluginState } from '../utils/wp-cli';

/** Boot an editor with the given settings and report what it warned about. */
function bootEditor( page: Page, settings: Record<string, unknown> ) {
	return page.evaluate( async ( options ) => {
		const warnings: string[] = [];
		const original = window.console.warn;
		const textarea = document.createElement( 'textarea' );

		window.console.warn = ( ...args: unknown[] ) => warnings.push( args.join( ' ' ) );
		textarea.id = 'legacy-settings';
		textarea.value = 'hello';
		document.querySelector( '#wpbody-content' )?.prepend( textarea );

		const [ editor ] = await window.tinymce.init( { selector: '#legacy-settings', ...options } );

		window.console.warn = original;

		const result = {
			warnings,
			content: editor.getContent(),
			rootBlock: editor.settings.forced_root_block,
			plugins: Object.keys( editor.plugins ),
		};

		editor.remove();

		return result;
	}, settings );
}

test.describe( 'compat4x: legacy classes, removed plugins, and removed settings', () => {
	test.beforeAll( () => setPluginState( 'classic-editor', true ) );

	test.beforeEach( async ( { page } ) => {
		await page.goto( routes.postNew );
		await expect( page.locator( '.tox-tinymce' ) ).toBeVisible();
		await page.waitForFunction( () => window.tinymce.get( 'content' )?.initialized );
	} );

	test( 'the editor, menus, and dialogs carry their v4 class names', async ( { page } ) => {
		const errors = collectErrors( page );
		const editor = page.locator( '#wp-content-editor-container' );

		await expect( editor.locator( '.tox-tinymce.mce-tinymce' ) ).toBeVisible();
		await expect( editor.locator( '.tox-editor-header.mce-toolbar-grp' ) ).toBeVisible();
		await expect( editor.locator( '.tox-edit-area.mce-edit-area' ) ).toBeVisible();
		await expect( editor.locator( '.tox-statusbar.mce-statusbar' ) ).toBeVisible();

		await page.locator( '[data-mce-name="blocks"]' ).click();
		await expect( page.locator( '.tox-menu.mce-menu' ) ).toBeVisible();
		await page.keyboard.press( 'Escape' );

		await page.evaluate( () => {
			window.tinymce.get( 'content' ).windowManager.open( { title: 'X', body: [] } );
		} );
		await expect( page.locator( '.tox-dialog.mce-window' ) ).toBeVisible();

		expect( errors ).toEqual( [] );
	} );

	test( 'core stylesheets do not restyle the toolbar through the v4 class names', async ( { page } ) => {
		const header = page.locator( '#wp-content-editor-container .mce-toolbar-grp' );

		await expect( header ).toHaveCSS( 'z-index', '2' );
		await expect( header.locator( '.tox-toolbar-overlord' ) ).toHaveCSS( 'padding-top', '0px' );
		await expect( header.locator( '.tox-anchorbar' ) ).toHaveCSS( 'padding-top', '0px' );

		// Core's editor.css would restyle every button through these, so they are not added.
		await expect( page.locator( '.tox-tbtn.mce-btn, .tox-toolbar__group.mce-btn-group, .mce-toolbar' ) ).toHaveCount( 0 );
		await expect( header.locator( '.tox-tbtn' ).first() ).toHaveCSS( 'border-top-width', '0px' );
	} );

	test( 'plugins merged into TinyMCE 8 are skipped quietly, and removed ones with a warning', async ( { page } ) => {
		const requests: string[] = [];

		page.on( 'response', ( response ) => {
			if ( 404 === response.status() ) {
				requests.push( response.url() );
			}
		} );

		const merged = await bootEditor( page, {
			plugins: 'paste hr textcolor colorpicker contextmenu tabfocus textpattern noneditable print lists',
		} );

		expect( merged.plugins ).toEqual( [ 'lists' ] );
		expect( merged.warnings.filter( ( warning ) => warning.includes( 'Skipped' ) ) ).toEqual( [] );

		const removed = await bootEditor( page, { plugins: 'fullpage template lists' } );

		expect( removed.plugins ).toEqual( [ 'lists' ] );
		expect( removed.warnings.filter( ( warning ) => warning.includes( 'Skipped' ) ) ).toHaveLength( 2 );
		expect( requests ).toEqual( [] );
	} );

	test( 'forced_root_block: false falls back to p without a TinyMCE warning', async ( { page } ) => {
		const result = await bootEditor( page, { forced_root_block: false, rtl_ui: true } );

		expect( result.rootBlock ).toBe( 'p' );
		expect( result.warnings.filter( ( warning ) => warning.startsWith( 'Invalid value' ) ) ).toEqual( [] );
		expect( result.warnings.join() ).toContain( 'forced_root_block' );
	} );

	test( 'switching tabs keeps a stable editor height, as on TinyMCE 4', async ( { page } ) => {
		const height = () => page.locator( '#content_ifr' ).evaluate( ( frame ) => frame.getBoundingClientRect().height );

		await page.locator( '#content-html' ).click();
		await page.locator( '#content-tmce' ).click();

		const first = await height();

		await page.locator( '#content-html' ).click();
		await page.locator( '#content-tmce' ).click();

		expect( await height() ).toBe( first );
	} );
} );
