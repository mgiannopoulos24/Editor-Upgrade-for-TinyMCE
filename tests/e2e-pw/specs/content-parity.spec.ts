import { test, expect, type Page } from '@playwright/test';
import { collectErrors, routes } from '../utils/page';
import { V4_BASELINE } from '../utils/v4-baseline';
import { getPostContent, resetEditorTab, setPluginState } from '../utils/wp-cli';

async function openNewPost( page: Page ) {
	await page.goto( routes.postNew );
	await expect( page.locator( '.tox-tinymce' ) ).toBeVisible();
}

async function setVisualContent( page: Page, html: string ) {
	await page.evaluate( ( value ) => window.tinymce.get( 'content' ).setContent( value ), html );
}

async function saveDraft( page: Page ) {
	await page.locator( '#title' ).fill( 'Content parity' );
	await Promise.all( [ page.waitForNavigation(), page.locator( '#save-post' ).click() ] );
	await expect( page.locator( '.tox-tinymce' ) ).toBeVisible();

	return page.locator( '#post_ID' ).inputValue();
}

const getEditorContent = ( page: Page ) =>
	page.evaluate( () => window.tinymce.get( 'content' ).getContent() );

test.describe( 'Saved HTML parity with TinyMCE 4', () => {
	test.beforeAll( () => setPluginState( 'classic-editor', true ) );
	test.beforeEach( () => resetEditorTab() );
	test.afterAll( () => resetEditorTab() );

	for ( const [ name, { input, stored } ] of Object.entries( V4_BASELINE ) ) {
		test( `Code -> Visual -> save: ${ name }`, async ( { page } ) => {
			const errors = collectErrors( page );

			await page.route( 'https://example.org/**', ( route ) => route.fulfill( { status: 200, body: '' } ) );
			await openNewPost( page );
			await page.locator( '#content-html' ).click();
			await page.locator( '#content' ).fill( input );
			await page.locator( '#content' ).evaluate( ( textarea: HTMLTextAreaElement ) => {
				textarea.setSelectionRange( textarea.value.length, textarea.value.length );
			} );
			await page.locator( '#content-tmce' ).click();

			const postId = await saveDraft( page );

			expect( getPostContent( postId ) ).toBe( stored ?? input );
			expect( errors.filter( ( error ) => ! error.includes( 'a.png' ) && ! error.includes( '404' ) ) ).toEqual( [] );
		} );
	}

	// When the Code tab is the default, core restores the selection on `tinymce-editor-init`.
	test( 'selection markers are not saved when the page opens on the Code tab', async ( { page } ) => {
		const input = V4_BASELINE.caption.input;

		await openNewPost( page );
		await page.locator( '#content-html' ).click();
		await page.locator( '#content' ).fill( 'draft' );
		await Promise.all( [ page.waitForNavigation(), page.locator( '#save-post' ).click() ] );

		await page.locator( '#content' ).fill( input );
		await page.locator( '#content' ).evaluate( ( textarea: HTMLTextAreaElement ) => {
			textarea.setSelectionRange( textarea.value.length, textarea.value.length );
		} );
		await page.locator( '#content-tmce' ).click();
		await expect( page.locator( '.tox-tinymce' ) ).toBeVisible();

		const postId = await saveDraft( page );

		expect( getPostContent( postId ) ).toBe( input );
	} );

	test( 'a site can turn the TinyMCE 8 content protections back on', async ( { page } ) => {
		await openNewPost( page );

		const saved = await page.evaluate( async () => {
			const textarea = document.createElement( 'textarea' );

			textarea.id = 'protected';
			textarea.value = '<iframe src="about:blank"></iframe>\n\n<!-- <b>x</b> -->';
			document.querySelector( '#wpbody-content' )?.prepend( textarea );

			const [ editor ] = await window.tinymce.init( {
				selector: '#protected',
				sandbox_iframes: true,
				allow_html_in_comments: false,
			} );

			editor.save();

			return textarea.value;
		} );

		expect( saved ).toContain( 'sandbox=""' );
		expect( saved ).not.toContain( '<b>x</b>' );
	} );

	test( 'the editor frame has square corners and no second border', async ( { page } ) => {
		await openNewPost( page );

		const frame = page.locator( '#wp-content-editor-container .tox-tinymce' );

		await expect( frame ).toHaveCSS( 'border-top-left-radius', '0px' );
		await expect( frame ).toHaveCSS( 'border-top-width', '0px' );
	} );

	test( 'script and style placeholders are visible in the editor', async ( { page } ) => {
		await openNewPost( page );
		await page.locator( '#content-html' ).click();
		await page.locator( '#content' ).fill( 'one\n\n<script>var a = 1;</script>\n\ntwo' );
		await page.locator( '#content-tmce' ).click();

		const placeholder = page.frameLocator( '#content_ifr' ).locator( 'img.mce-object-script' );

		await expect( placeholder ).toBeVisible();
		await expect( placeholder ).toHaveCSS( 'background-image', /script\.svg/ );
	} );

	test( 'tinymce-editor-setup and tinymce-editor-init fire for each editor', async ( { page } ) => {
		await openNewPost( page );

		const fired = await page.evaluate( async () => {
			const events: string[] = [];
			const textarea = document.createElement( 'textarea' );

			window.jQuery( document ).on( 'tinymce-editor-setup tinymce-editor-init', ( event, editor ) => {
				events.push( `${ event.type }:${ editor.id }` );
			} );

			textarea.id = 'events';
			document.querySelector( '#wpbody-content' )?.prepend( textarea );
			await window.tinymce.init( { selector: '#events' } );

			return events;
		} );

		expect( fired ).toEqual( [ 'tinymce-editor-setup:events', 'tinymce-editor-init:events' ] );
	} );

	test( 'void elements keep the XHTML format', async ( { page } ) => {
		const errors = collectErrors( page );

		// Core sets `indent: false` when wpautop is on, so TinyMCE 4 adds no newlines here either.
		const html = '<p>one<br />two</p><hr /><p><img src="https://example.org/a.png" alt="" /></p>';

		await page.route( 'https://example.org/**', ( route ) => route.fulfill( { status: 200, body: '' } ) );
		await openNewPost( page );
		await setVisualContent( page, html );

		expect( await getEditorContent( page ) ).toBe( html );
		expect( errors ).toEqual( [] );
	} );

	test( 'a Visual save stores content without <p> tags and restores them on reload', async ( { page } ) => {
		const errors = collectErrors( page );

		await openNewPost( page );
		await setVisualContent( page, '<p>one</p><p>two<br />three</p><p>&nbsp;</p><p>four</p>' );

		const postId = await saveDraft( page );

		expect( getPostContent( postId ) ).toBe( 'one\n\ntwo\nthree\n\n&nbsp;\n\nfour' );
		// Core sets `entity_encoding: raw`, so the editor returns the character, not the entity.
		expect( await getEditorContent( page ) ).toBe( '<p>one</p><p>two<br />three</p><p>\u00a0</p><p>four</p>' );

		// Saving again without edits must not change what is stored.
		await saveDraft( page );
		expect( getPostContent( postId ) ).toBe( 'one\n\ntwo\nthree\n\n&nbsp;\n\nfour' );

		expect( errors ).toEqual( [] );
	} );

	test( 'a save from the Code tab stores the textarea unchanged', async ( { page } ) => {
		const errors = collectErrors( page );
		const text = 'one\n\n<em>two</em>';

		await openNewPost( page );
		await page.locator( '#content-html' ).click();
		await page.locator( '#content' ).fill( text );
		await page.locator( '#title' ).fill( 'Content parity' );
		await Promise.all( [ page.waitForNavigation(), page.locator( '#save-post' ).click() ] );

		const postId = await page.locator( '#post_ID' ).inputValue();

		expect( getPostContent( postId ) ).toBe( text );
		expect( errors ).toEqual( [] );
	} );

	test( 'with wpautop off, <p> tags stay in the saved content', async ( { page } ) => {
		const errors = collectErrors( page );

		await openNewPost( page );

		const saved = await page.evaluate( async () => {
			const textarea = document.createElement( 'textarea' );

			textarea.id = 'no-autop';
			textarea.value = '<p>one</p>\n\n<p>two</p>';
			document.querySelector( '#wpbody-content' )?.prepend( textarea );

			const [ editor ] = await window.tinymce.init( { selector: '#no-autop', wpautop: false, indent: false } );

			editor.save();

			return textarea.value;
		} );

		expect( saved ).toBe( '<p>one</p><p>two</p>' );
		expect( errors ).toEqual( [] );
	} );
} );
