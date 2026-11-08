import { test, expect, type Page } from '@playwright/test';
import { collectErrors, routes } from '../utils/page';
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

	// When the Code tab is the default, core restores the selection on `tinymce-editor-init`.
	test( 'selection markers are not saved when the page opens on the Code tab', async ( { page } ) => {
		const input = '[caption id="a" align="alignnone" width="10"]<img src="/a.png" alt="" width="10" height="10" /> cap[/caption]';

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

	test( 'a standalone editor without the wordpress plugin stays plain, as on TinyMCE 4', async ( { page } ) => {
		await openNewPost( page );

		const result = await page.evaluate( async () => {
			const fired: string[] = [];
			const textarea = document.createElement( 'textarea' );

			window.jQuery( document ).on( 'tinymce-editor-setup tinymce-editor-init', ( event, editor ) => {
				if ( 'standalone' === editor.id ) {
					fired.push( event.type );
				}
			} );

			textarea.id = 'standalone';
			textarea.value = 'one\n\ntwo <b>b</b>';
			document.querySelector( '#wpbody-content' )?.prepend( textarea );

			const [ editor ] = await window.tinymce.init( { selector: '#standalone' } );
			const content = editor.getContent();

			editor.save();

			return { content, saved: textarea.value, fired };
		} );

		// Recorded from real TinyMCE 4.
		expect( result ).toEqual( {
			content: '<p>one two <strong>b</strong></p>',
			saved: '<p>one two <strong>b</strong></p>',
			fired: [],
		} );
	} );

	test( 'a pasted image file is not saved into the post as base64', async ( { page, browserName } ) => {
		test.skip( 'firefox' === browserName, 'Firefox ignores clipboardData in a synthetic ClipboardEvent.' );

		await openNewPost( page );

		const pasteImage = ( settings: Record<string, unknown> ) =>
			page.evaluate( async ( options ) => {
				const textarea = document.createElement( 'textarea' );

				textarea.id = `paste-${ Date.now() }`;
				document.querySelector( '#wpbody-content' )?.prepend( textarea );

				const [ editor ] = await window.tinymce.init( { selector: `#${ textarea.id }`, ...options } );
				const frame = editor.getWin() as Window & typeof globalThis;
				const data = new frame.DataTransfer();
				const png = Uint8Array.from(
					atob( 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/AAwAD/wH+1HY5WAAAAABJRU5ErkJggg==' ),
					( character ) => character.charCodeAt( 0 )
				);

				editor.focus();
				editor.setContent( '<p>s</p>' );
				data.items.add( new frame.File( [ png ], 'a.png', { type: 'image/png' } ) );
				editor.getBody().dispatchEvent(
					new frame.ClipboardEvent( 'paste', { clipboardData: data, bubbles: true, cancelable: true } )
				);

				await new Promise( ( resolve ) => setTimeout( resolve, 600 ) );

				return editor.getContent();
			}, settings );

		expect( await pasteImage( {} ) ).not.toContain( '<img' );

		// A site can opt in, as on TinyMCE 4.
		expect( await pasteImage( { paste_data_images: true } ) ).toContain( '<img' );
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
			await window.tinymce.init( { selector: '#events', plugins: 'wordpress' } );

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

			const [ editor ] = await window.tinymce.init( {
				selector: '#no-autop',
				plugins: 'wordpress',
				wpautop: false,
				indent: false,
			} );

			editor.save();

			return textarea.value;
		} );

		expect( saved ).toBe( '<p>one</p><p>two</p>' );
		expect( errors ).toEqual( [] );
	} );
} );
