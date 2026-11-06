import { test, expect, type Page } from '@playwright/test';
import { collectErrors, routes } from '../utils/page';
import { DIALOG_PROBE_SOURCE, V4_DIALOG_LOG } from '../utils/v4-dialog-probe';
import { setPluginState } from '../utils/wp-cli';

/** Open a dialog from a function that runs in the page with `editor` and `log` in scope. */
async function openDialog( page: Page, source: string ) {
	await page.evaluate( ( code ) => {
		window.compat4xLog = [];
		// eslint-disable-next-line no-new-func
		new Function( 'editor', 'log', code )(
			window.tinymce.get( 'content' ),
			( entry: unknown ) => window.compat4xLog.push( JSON.stringify( entry ) )
		);
	}, source );
	await expect( page.locator( '.tox-dialog' ) ).toBeVisible();
}

const getLog = ( page: Page ) =>
	page.evaluate( () => window.compat4xLog.map( ( entry ) => JSON.parse( entry ) ) );

test.describe( 'compat4x: editor.windowManager.open() with a v4 dialog', () => {
	test.beforeAll( () => setPluginState( 'classic-editor', true ) );

	test.beforeEach( async ( { page } ) => {
		await page.goto( routes.postNew );
		await expect( page.locator( '.tox-tinymce' ) ).toBeVisible();
		await page.waitForFunction( () => window.tinymce.get( 'content' )?.initialized );
	} );

	test( 'the window API matches the output recorded from TinyMCE 4', async ( { page } ) => {
		const errors = collectErrors( page );

		await page.addScriptTag( { content: DIALOG_PROBE_SOURCE } );

		const log = await page.evaluate( () => window.dialogProbe() );

		expect( log ).toEqual( V4_DIALOG_LOG );
		expect( errors ).toEqual( [] );
	} );

	test( 'fields render, take initial values, and Ok submits the edited data', async ( { page } ) => {
		const errors = collectErrors( page );

		await openDialog( page, `
			editor.windowManager.open( {
				title: 'Fields',
				data: { url: 'https://example.org/' },
				body: [
					{ type: 'textbox', name: 'url', label: 'Address' },
					{ type: 'textbox', name: 'notes', label: 'Notes', multiline: true, value: 'hello' },
					{ type: 'listbox', name: 'size', label: 'Size', values: [ { text: 'Small', value: 1 }, { text: 'Large', value: 2 } ] },
					{ type: 'checkbox', name: 'wide', text: 'Wide', checked: true },
					{ type: 'label', text: 'Plain <b>text</b>' },
					{ type: 'container', html: '<em class="fixture-html">Markup</em>', classes: 'fixture' },
				],
				onsubmit: function ( e ) { log( e.data ); },
			} );
		` );

		const dialog = page.locator( '.tox-dialog' );

		await expect( dialog.getByLabel( 'Address' ) ).toHaveValue( 'https://example.org/' );
		await expect( dialog.getByLabel( 'Notes' ) ).toHaveValue( 'hello' );
		await expect( dialog.getByText( 'Plain <b>text</b>' ) ).toBeVisible();
		await expect( dialog.locator( '.mce-fixture .fixture-html' ) ).toHaveText( 'Markup' );

		await dialog.getByLabel( 'Address' ).fill( 'https://example.com/' );
		await dialog.getByRole( 'combobox', { name: 'Size' } ).click();
		await page.locator( '.tox-collection__item' ).filter( { hasText: 'Large' } ).click();
		await dialog.getByRole( 'button', { name: 'Ok' } ).click();

		await expect( dialog ).toBeHidden();
		expect( await getLog( page ) ).toEqual( [
			{ url: 'https://example.com/', notes: 'hello', size: 2, wide: true },
		] );
		expect( errors ).toEqual( [] );
	} );

	test( 'preventDefault() in onsubmit keeps the dialog open', async ( { page } ) => {
		await openDialog( page, `
			editor.windowManager.open( {
				title: 'Keep',
				body: [ { type: 'textbox', name: 'a', label: 'A' } ],
				onsubmit: function ( e ) { log( 'submit' ); e.preventDefault(); },
			} );
		` );

		await page.locator( '.tox-dialog' ).getByRole( 'button', { name: 'Ok' } ).click();

		expect( await getLog( page ) ).toEqual( [ 'submit' ] );
		await expect( page.locator( '.tox-dialog' ) ).toBeVisible();
	} );

	test( 'the Cancel button closes without submitting, and Escape also fires oncancel', async ( { page } ) => {
		const source = `
			editor.windowManager.open( {
				title: 'Close',
				body: [ { type: 'textbox', name: 'a', label: 'A' } ],
				onsubmit: function () { log( 'submit' ); },
				oncancel: function () { log( 'cancel' ); },
				onclose: function () { log( 'close' ); },
			} );
		`;

		await openDialog( page, source );
		await page.locator( '.tox-dialog' ).getByRole( 'button', { name: 'Cancel' } ).click();
		await expect( page.locator( '.tox-dialog' ) ).toBeHidden();
		expect( await getLog( page ) ).toEqual( [ 'close' ] );

		// Firefox can leave focus in the editor when a dialog opens from script, with native dialogs too.
		await openDialog( page, source );
		await page.locator( '.tox-dialog' ).getByLabel( 'A', { exact: true } ).focus();
		await page.keyboard.press( 'Escape' );
		await expect( page.locator( '.tox-dialog' ) ).toBeHidden();
		expect( await getLog( page ) ).toEqual( [ 'cancel', 'close' ] );
	} );

	test( 'custom buttons and field handlers receive the v4 control', async ( { page } ) => {
		await openDialog( page, `
			var win = editor.windowManager.open( {
				title: 'Handlers',
				body: [
					{ type: 'textbox', name: 'a', label: 'A', onchange: function () { log( 'changed:' + this.value() ); } },
					{ type: 'button', name: 'fill', text: 'Fill', onclick: function () { win.find( '#a' ).value( 'filled' ); log( 'inner:' + this.name() ); } },
				],
				buttons: [
					{ text: 'Read', onclick: function () { log( 'read:' + win.find( '#a' ).value() ); } },
					{ text: 'Save', subtype: 'primary', onclick: function () { win.find( 'form' )[ 0 ].submit(); } },
				],
				onsubmit: function ( e ) { log( e.data ); },
			} );
		` );

		const dialog = page.locator( '.tox-dialog' );

		await dialog.getByRole( 'button', { name: 'Fill' } ).click();
		await dialog.getByRole( 'button', { name: 'Read' } ).click();
		await dialog.getByLabel( 'A', { exact: true } ).fill( 'typed' );
		await dialog.getByRole( 'button', { name: 'Save' } ).click();
		await expect( dialog ).toBeHidden();

		const log = await getLog( page );

		expect( log ).toContain( 'inner:fill' );
		expect( log ).toContain( 'read:filled' );
		expect( log ).toContain( 'changed:typed' );
		expect( log.at( -1 ) ).toEqual( { a: 'typed', fill: '' } );
	} );

	test( 'tab panels render each tab and submit all fields', async ( { page } ) => {
		await openDialog( page, `
			editor.windowManager.open( {
				title: 'Tabs',
				bodyType: 'tabpanel',
				body: [
					{ title: 'First', type: 'form', items: [ { type: 'textbox', name: 'one', label: 'One', value: '1' } ] },
					{ title: 'Second', type: 'form', items: [ { type: 'textbox', name: 'two', label: 'Two', value: '2' } ] },
				],
				onsubmit: function ( e ) { log( e.data ); },
			} );
		` );

		const dialog = page.locator( '.tox-dialog' );

		await dialog.getByRole( 'tab', { name: 'Second' } ).click();
		await dialog.getByLabel( 'Two' ).fill( 'changed' );
		await dialog.getByRole( 'button', { name: 'Ok' } ).click();

		expect( await getLog( page ) ).toEqual( [ { one: '1', two: 'changed' } ] );
	} );

	test( 'a URL dialog loads the page, and the page can read params and close itself', async ( { page } ) => {
		await page.route( '**/compat4x-dialog-page.html*', ( route ) =>
			route.fulfill( {
				contentType: 'text/html',
				body: `<button id="done" onclick="
					var manager = parent.tinymce.activeEditor.windowManager;
					parent.compat4xLog.push( JSON.stringify( manager.getParams() ) );
					manager.close();
				">Done</button>`,
			} )
		);

		await openDialog( page, `
			editor.windowManager.open( {
				title: 'Page',
				url: '/compat4x-dialog-page.html',
				width: 400,
				height: 200,
				onclose: function () { log( 'closed' ); },
			}, { from: 'params' } );
		` );

		await page.frameLocator( '.tox-dialog iframe' ).locator( '#done' ).click();
		await expect( page.locator( '.tox-dialog' ) ).toBeHidden();

		expect( await getLog( page ) ).toEqual( [ { from: 'params' }, 'closed' ] );
	} );

	test( 'a TinyMCE 8 dialog spec is passed through unchanged', async ( { page } ) => {
		const errors = collectErrors( page );

		await openDialog( page, `
			var api = editor.windowManager.open( {
				title: 'Native',
				body: { type: 'panel', items: [ { type: 'input', name: 'a', label: 'A' } ] },
				initialData: { a: 'native' },
				buttons: [ { type: 'submit', text: 'Go' } ],
				onSubmit: function ( dialogApi ) { log( dialogApi.getData() ); dialogApi.close(); },
			} );
			log( typeof api.getData );
		` );

		await page.locator( '.tox-dialog' ).getByRole( 'button', { name: 'Go' } ).click();
		await expect( page.locator( '.tox-dialog' ) ).toBeHidden();

		expect( await getLog( page ) ).toEqual( [ 'function', { a: 'native' } ] );
		expect( errors ).toEqual( [] );
	} );
} );
