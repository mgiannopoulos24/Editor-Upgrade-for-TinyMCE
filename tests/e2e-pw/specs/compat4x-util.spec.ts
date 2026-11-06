import { test, expect } from '@playwright/test';
import { routes } from '../utils/page';
import { UTIL_PROBE_SOURCE, V4_UTIL_LOG } from '../utils/v4-util-probe';
import { setPluginState } from '../utils/wp-cli';

test.describe( 'compat4x: tinymce.util, tinymce.html, and plugin APIs', () => {
	test.beforeAll( () => setPluginState( 'classic-editor', true ) );

	test.beforeEach( async ( { page } ) => {
		await page.route( /\/compat4x-echo\.json/, async ( route ) => {
			const request = route.request();
			const query = new URL( request.url() ).searchParams;

			if ( query.has( 'status' ) ) {
				return route.fulfill( { status: 404, body: 'gone' } );
			}

			if ( query.has( 'jsonp' ) ) {
				return route.fulfill( {
					contentType: 'text/javascript',
					body: `tinymce.util.JSONP.callbacks[${ query.get( 'jsonp' ) }]({"p":1});`,
				} );
			}

			if ( 'ok' === query.get( 'json' ) ) {
				return route.fulfill( {
					contentType: 'application/json',
					body: JSON.stringify( {
						result: {
							sent: JSON.parse( request.postData() ?? '{}' ).method,
							ct: request.headers()[ 'content-type' ],
						},
					} ),
				} );
			}

			if ( 'error' === query.get( 'json' ) ) {
				return route.fulfill( { body: '{"error":"bad thing"}' } );
			}

			if ( 'bad' === query.get( 'json' ) ) {
				return route.fulfill( { body: 'nope' } );
			}

			const headers = request.headers();

			return route.fulfill( {
				body: [
					request.method(),
					request.postData() ?? '',
					headers[ 'x-fixture' ] ?? '',
					headers[ 'x-requested-with' ] ?? '',
					headers[ 'content-type' ] ?? '',
				].join( ':' ),
			} );
		} );

		await page.goto( routes.postNew );
		await expect( page.locator( '.tox-tinymce' ) ).toBeVisible();
	} );

	test( 'match the output recorded from TinyMCE 4', async ( { page } ) => {
		await page.addScriptTag( { content: UTIL_PROBE_SOURCE } );

		const log = await page.evaluate( () => window.utilProbe( '/compat4x-echo.json' ) );

		expect( log ).toEqual( V4_UTIL_LOG );
	} );

	test( 'arrow function plugins, which TinyMCE 4 could not run, still load', async ( { page } ) => {
		const loaded = await page.evaluate( async () => {
			const textarea = document.createElement( 'textarea' );

			textarea.id = 'arrow-plugin';
			document.body.appendChild( textarea );
			window.tinymce.PluginManager.add( 'compat4xarrow', () => ( { api: () => 'arrow' } ) );

			const [ editor ] = await window.tinymce.init( { selector: '#arrow-plugin', plugins: 'compat4xarrow' } );
			const result = ( editor.plugins.compat4xarrow as { api(): string } ).api();

			editor.remove();

			return result;
		} );

		expect( loaded ).toBe( 'arrow' );
	} );
} );
