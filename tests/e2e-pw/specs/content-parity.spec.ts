import { test, expect, type Page } from '@playwright/test';
import { collectErrors, getPostContent, resetEditorTab, routes, setPluginState } from './helpers';

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

/**
 * What TinyMCE 4 stores for each input after Code -> Visual -> save. Recorded on WordPress 7.1.3
 * with this plugin deactivated; update these only against a new recording from TinyMCE 4.
 */
const V4_BASELINE: Record<string, { input: string; stored?: string }> = {
	paragraphs: { input: 'one\n\ntwo' },
	'empty paragraph': { input: 'one\n\n&nbsp;\n\ntwo' },
	'more tag': { input: 'one\n\n<!--more-->\n\ntwo' },
	'nextpage tag': { input: 'one\n\n<!--nextpage-->\n\ntwo' },
	script: { input: 'one\n\n<script>var a = 1;</script>\n\ntwo' },
	style: { input: 'one\n\n<style>.a{color:red}</style>\n\ntwo' },
	'b and i': { input: 'one <b>bold</b> <i>ital</i>' },
	shortcode: { input: 'one\n\n[gallery ids="1,2"]\n\ntwo' },
	comment: { input: 'one\n\n<!-- note -->\n\ntwo' },
	'list first': {
		input: '<ul>\n <li>a</li>\n <li>b</li>\n</ul>',
		stored: '<ul>\n \t<li>a</li>\n \t<li>b</li>\n</ul>',
	},
	'list between text': {
		input: 'one\n<ul>\n <li>a</li>\n</ul>\ntwo',
		stored: 'one\n<ul>\n \t<li>a</li>\n</ul>\ntwo',
	},
	'table first': { input: '<table>\n<tbody>\n<tr>\n<td>a</td>\n</tr>\n</tbody>\n</table>\n&nbsp;' },
	'void elements': {
		input: 'one<br />two\n<hr />\n<img src="/a.png" alt="" />',
		stored: 'one\ntwo\n\n<hr />\n\n<img src="/a.png" alt="" />',
	},
	attributes: {
		input: '<a href="/x" target="_blank" rel="noopener">l</a> <span style="color: red;" class="c">s</span>',
		stored: '<a href="/x" target="_blank" rel="noopener">l</a> <span class="c" style="color: red;">s</span>',
	},
	entities: { input: 'a &amp; b &lt; c "q" \u00e9' },
	iframe: { input: '<iframe src="https://example.org/" width="10" height="10"></iframe>' },
	caption: {
		input: '[caption id="a" align="alignnone" width="10"]<img src="/a.png" alt="" width="10" height="10" /> cap[/caption]',
	},
};

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
