import { test, expect, type Page } from '@playwright/test';
import { collectErrors, routes, setPluginState } from './helpers';

// A regular expression, because `cache_suffix` adds a query string to the URL.
const PLUGIN_PATH = /\/compat4x-ui-fixture\.js/;

// A plugin written against the TinyMCE 4 API, registered the way mce_external_plugins does.
const PLUGIN_SOURCE = `
tinymce.PluginManager.add( 'compat4xfixture', function ( editor ) {
	editor.addButton( 'fixture_cmd', { text: 'Run command', cmd: 'fixtureCommand' } );
	editor.addButton( 'fixture_state', {
		text: 'State',
		stateSelector: 'strong'
	} );
	editor.addButton( 'fixture_postrender', {
		text: 'Post render',
		onPostRender: function () {
			this.active( true );
			window.compat4xLog.push( 'postrender:' + this.active() );
		}
	} );
	editor.addButton( 'fixture_menu', {
		type: 'menubutton',
		text: 'Menu',
		icon: false,
		menu: [
			{ text: 'First', onclick: function () { window.compat4xLog.push( 'menu:first' ); } },
			{ text: '-' },
			{ text: 'Nested', menu: [ { text: 'Inner', onclick: function () { window.compat4xLog.push( 'menu:inner' ); } } ] }
		]
	} );
	editor.addButton( 'fixture_list', {
		type: 'listbox',
		text: 'Pick',
		values: [ { text: 'Alpha', value: 'a' }, { text: 'Beta', value: 'b' } ],
		onselect: function () {
			window.compat4xLog.push( 'list:' + this.value() );
		}
	} );
	editor.addButton( 'fixture_split', {
		type: 'splitbutton',
		text: 'Split',
		onclick: function () { window.compat4xLog.push( 'split:main' ); },
		menu: [ { text: 'Other', onclick: function () { window.compat4xLog.push( 'split:other' ); } } ]
	} );
	editor.addButton( 'fixture_builtin_icon', { tooltip: 'Builtin icon', icon: 'bullist', onclick: function () {} } );
	editor.addButton( 'fixture_css_icon', { tooltip: 'CSS icon', icon: 'fixture-css', onclick: function () {} } );
	editor.addButton( 'fixture_image', { tooltip: 'Image icon', image: 'https://example.org/i.png', onclick: function () {} } );
	editor.addButton( 'fixture_dashicon', { tooltip: 'Dashicon', icon: 'dashicon dashicons-admin-links', onclick: function () {} } );

	editor.addMenuItem( 'fixture_item', {
		text: 'Menu item',
		onclick: function () { window.compat4xLog.push( 'item:click' ); }
	} );
	editor.addMenuItem( 'fixture_toggle', { text: 'Toggle item', selectable: true, stateSelector: 'strong' } );
	editor.addMenuItem( 'fixture_nested', {
		text: 'Nested item',
		menu: [ { text: 'Inner item', onclick: function () { window.compat4xLog.push( 'item:inner' ); } } ]
	} );
	editor.addCommand( 'fixtureCommand', function () { window.compat4xLog.push( 'cmd' ); } );
} );
`;

async function bootFixture( page: Page ) {
	await page.route( PLUGIN_PATH, ( route ) =>
		route.fulfill( { contentType: 'text/javascript', body: PLUGIN_SOURCE } )
	);
	await page.route( 'https://example.org/**', ( route ) => route.fulfill( { status: 200, body: '' } ) );
	await page.goto( routes.postNew );
	await expect( page.locator( '#content_ifr' ) ).toBeAttached();

	await page.evaluate( () => {
		const textarea = document.createElement( 'textarea' );

		window.compat4xLog = [];
		textarea.id = 'compat4x-fixture';
		document.querySelector( '#wpbody-content' )?.prepend( textarea );

		return window.tinymce.init( {
			selector: '#compat4x-fixture',
			height: 300,
			external_plugins: { compat4xfixture: '/wp-content/plugins/compat4x-ui-fixture.js' },
			menubar: 'fixture',
			menu: { fixture: { title: 'Fixture', items: 'fixture_item fixture_toggle fixture_nested' } },
			toolbar: [
				'fixtureSetup fixture_cmd fixture_state fixture_postrender fixture_menu fixture_list fixture_split',
				'fixture_builtin_icon fixture_css_icon fixture_image fixture_dashicon',
			].join( ' ' ),
			toolbar_mode: 'wrap',
			setup( editor ) {
				// `setup` runs before TinyMCE has loaded its icons or fired AddEditor.
				editor.addButton( 'fixtureSetup', {
					text: 'From setup',
					onclick() {
						window.compat4xLog.push( 'setup:' + ( this.settings.text as string ) );
					},
				} );
			},
		} );
	} );

	const toolbar = page.locator( '#wpbody-content .tox-tinymce' ).first();
	await expect( toolbar.getByRole( 'button', { name: 'From setup' } ) ).toBeVisible();

	return toolbar;
}

const getLog = ( page: Page ) => page.evaluate( () => window.compat4xLog );

test.describe( 'compat4x: editor.addButton() and editor.addMenuItem()', () => {
	test.beforeAll( () => setPluginState( 'classic-editor', true ) );

	test( 'plain buttons run onclick and cmd, including a button added in setup', async ( { page } ) => {
		const errors = collectErrors( page );
		const editor = await bootFixture( page );

		await editor.getByRole( 'button', { name: 'From setup' } ).click();
		await editor.getByRole( 'button', { name: 'Run command' } ).click();

		expect( await getLog( page ) ).toEqual(
			expect.arrayContaining( [ 'setup:From setup', 'cmd' ] )
		);
		expect( errors ).toEqual( [] );
	} );

	test( 'stateSelector and onPostRender control the active state', async ( { page } ) => {
		const errors = collectErrors( page );
		const editor = await bootFixture( page );
		const state = editor.getByRole( 'button', { name: 'State', exact: true } );

		await expect( editor.getByRole( 'button', { name: 'Post render' } ) ).toHaveAttribute( 'aria-pressed', 'true' );
		expect( await getLog( page ) ).toContain( 'postrender:true' );
		await expect( state ).toHaveAttribute( 'aria-pressed', 'false' );

		await page.evaluate( () => {
			const instance = window.tinymce.get( 'compat4x-fixture' );

			instance.setContent( '<p><strong>bold</strong></p>' );
			instance.selection.select( instance.dom.select( 'strong' )[ 0 ] );
			instance.nodeChanged();
		} );
		await expect( state ).toHaveAttribute( 'aria-pressed', 'true' );

		await page.evaluate( () => {
			const instance = window.tinymce.get( 'compat4x-fixture' );

			instance.setContent( '<p>plain</p>' );
			instance.selection.select( instance.dom.select( 'p' )[ 0 ] );
			instance.nodeChanged();
		} );
		await expect( state ).toHaveAttribute( 'aria-pressed', 'false' );

		expect( errors ).toEqual( [] );
	} );

	test( 'menubutton, listbox, and splitbutton map to their v8 equivalents', async ( { page } ) => {
		const errors = collectErrors( page );
		const editor = await bootFixture( page );

		await editor.getByRole( 'button', { name: 'Menu', exact: true } ).click();
		await page.getByRole( 'menuitem', { name: 'First' } ).click();

		await editor.getByRole( 'button', { name: 'Menu', exact: true } ).click();
		await page.getByRole( 'menuitem', { name: 'Nested' } ).click();
		await page.getByRole( 'menuitem', { name: 'Inner' } ).click();

		await editor.getByRole( 'button', { name: 'Pick' } ).click();
		await page.getByRole( 'menuitem', { name: 'Beta' } ).click();
		await expect( editor.getByRole( 'button', { name: 'Beta' } ) ).toBeVisible();

		await editor.locator( '.tox-split-button__main' ).filter( { hasText: 'Split' } ).click();
		await expect( editor.locator( '.tox-split-button__chevron' ) ).toHaveAttribute( 'aria-label', 'Split' );
		await editor.locator( '.tox-split-button__chevron' ).click();
		await page.locator( '.tox-collection__item' ).filter( { hasText: 'Other' } ).click();

		expect( await getLog( page ) ).toEqual(
			expect.arrayContaining( [ 'menu:first', 'menu:inner', 'list:b', 'split:main', 'split:other' ] )
		);
		expect( errors ).toEqual( [] );
	} );

	test( 'icons resolve to v8 icons, v4 CSS classes, or images', async ( { page } ) => {
		const errors = collectErrors( page );
		const editor = await bootFixture( page );

		await expect( editor.getByRole( 'button', { name: 'Builtin icon' } ).locator( 'svg' ) ).toBeVisible();
		await expect( editor.getByRole( 'button', { name: 'CSS icon' } ).locator( 'i.mce-ico.mce-i-fixture-css' ) ).toBeAttached();
		await expect( editor.getByRole( 'button', { name: 'Image icon' } ).locator( 'img' ) ).toHaveAttribute(
			'src',
			'https://example.org/i.png'
		);

		const dashiconFont = await editor
			.getByRole( 'button', { name: 'Dashicon' } )
			.locator( 'i.dashicons-admin-links' )
			.evaluate( ( icon ) => window.getComputedStyle( icon, '::before' ).fontFamily );

		expect( dashiconFont ).toContain( 'dashicons' );
		expect( errors ).toEqual( [] );
	} );

	test( 'menu items work when placed in a menu', async ( { page } ) => {
		const errors = collectErrors( page );
		const editor = await bootFixture( page );

		await editor.getByRole( 'menuitem', { name: 'Fixture' } ).click();
		await page.getByRole( 'menuitem', { name: 'Menu item' } ).click();

		await editor.getByRole( 'menuitem', { name: 'Fixture' } ).click();
		await expect( page.getByRole( 'menuitemcheckbox', { name: 'Toggle item' } ) ).toBeVisible();
		await page.getByRole( 'menuitem', { name: 'Nested item' } ).click();
		await page.getByRole( 'menuitem', { name: 'Inner item' } ).click();

		expect( await getLog( page ) ).toEqual( expect.arrayContaining( [ 'item:click', 'item:inner' ] ) );
		expect( errors ).toEqual( [] );
	} );

	test( 'editor.buttons reads registered buttons and registers on write', async ( { page } ) => {
		const errors = collectErrors( page );

		await bootFixture( page );

		const result = await page.evaluate( () => {
			const instance = window.tinymce.get( 'compat4x-fixture' );

			instance.buttons.fixture_written = { text: 'Written' };

			return {
				v4Spec: instance.buttons.fixture_cmd.cmd,
				caseInsensitive: Boolean( instance.buttons.fixtureSetup ),
				native: Boolean( instance.buttons.bold ),
				missing: instance.buttons.nope,
				written: 'fixture_written' in instance.ui.registry.getAll().buttons,
				listed: Object.keys( instance.buttons ).includes( 'fixture_cmd' ),
			};
		} );

		expect( result ).toEqual( {
			v4Spec: 'fixtureCommand',
			caseInsensitive: true,
			native: true,
			missing: undefined,
			written: true,
			listed: true,
		} );
		expect( errors ).toEqual( [] );
	} );
} );
