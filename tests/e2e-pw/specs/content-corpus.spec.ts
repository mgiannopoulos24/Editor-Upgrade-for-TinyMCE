import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { routes } from '../utils/page';
import { getPostContent, resetEditorTab, setPluginState } from '../utils/wp-cli';

/**
 * The content corpus (plan Section 10.3). The reference is what real TinyMCE 4 stores:
 * `bun run test:corpus:record` deactivates this plugin and rewrites v4-expected.json.
 * accepted-diffs.json lists every approved difference, with its reason.
 */
interface CorpusEntry {
	name: string;
	category: string;
	input: string;
	paste?: { html: string; text: string };
}

const DIR = path.join( __dirname, '..', '..', 'fixtures', 'content' );
const EXPECTED_FILE = path.join( DIR, 'v4-expected.json' );
const ACCEPTED_FILE = path.join( DIR, 'accepted-diffs.json' );
const RECORDING = Boolean( process.env.CORPUS_RECORD );

const readJson = ( file: string ) => ( fs.existsSync( file ) ? JSON.parse( fs.readFileSync( file, 'utf8' ) ) : {} );
const corpus: CorpusEntry[] = readJson( path.join( DIR, 'corpus.json' ) );
const expected: Record<string, string> = readJson( EXPECTED_FILE );
const accepted: Record<string, { stored: string; also?: string[]; status: string; reason: string }> = readJson( ACCEPTED_FILE );

async function pasteInto( page: Page, paste: NonNullable<CorpusEntry[ 'paste' ]> ) {
	await page.waitForFunction( () => window.tinymce?.get( 'content' )?.initialized );
	await page.evaluate( async ( data ) => {
		const editor = window.tinymce.get( 'content' );
		const frame = editor.getWin() as Window & typeof globalThis;
		const transfer = new frame.DataTransfer();

		editor.focus();
		transfer.setData( 'text/html', data.html );
		transfer.setData( 'text/plain', data.text );
		editor.getBody().dispatchEvent(
			new frame.ClipboardEvent( 'paste', { clipboardData: transfer, bubbles: true, cancelable: true } )
		);

		await new Promise( ( resolve ) => setTimeout( resolve, 300 ) );
	}, paste );
}

test.describe( 'Content corpus', () => {
	test.beforeAll( () => {
		setPluginState( 'classic-editor', true );
		resetEditorTab();

		if ( RECORDING ) {
			setPluginState( 'editor-upgrade-for-tinymce', false );
		}
	} );

	test.afterAll( () => {
		if ( RECORDING ) {
			setPluginState( 'editor-upgrade-for-tinymce', true );
		}
	} );

	for ( const entry of corpus ) {
		test( `${ entry.category }: ${ entry.name }`, async ( { page, browserName } ) => {
			test.skip( Boolean( entry.paste ) && 'firefox' === browserName, 'Firefox ignores clipboardData in a synthetic ClipboardEvent.' );

			await page.route( 'https://example.org/**', ( route ) => route.fulfill( { status: 200, body: '' } ) );
			await page.goto( routes.postNew );
			await page.waitForSelector( '#wp-content-wrap' );

			if ( entry.paste ) {
				await pasteInto( page, entry.paste );
			} else {
				await page.locator( '#content-html' ).click();
				await page.locator( '#content' ).fill( entry.input );
				await page.locator( '#content' ).evaluate( ( textarea: HTMLTextAreaElement ) => {
					textarea.setSelectionRange( textarea.value.length, textarea.value.length );
				} );
				await page.locator( '#content-tmce' ).click();
				await page.waitForTimeout( 300 );
			}

			await page.locator( '#title' ).fill( 'Corpus' );
			await Promise.all( [ page.waitForNavigation(), page.locator( '#save-post' ).click() ] );

			const stored = getPostContent( await page.locator( '#post_ID' ).inputValue() );

			if ( RECORDING ) {
				// Saved after each test, because a failing test restarts the worker.
				const results = readJson( EXPECTED_FILE );

				results[ entry.name ] = stored;
				fs.writeFileSync( EXPECTED_FILE, JSON.stringify( results, null, '\t' ) + '\n' );
				return;
			}

			const diff = accepted[ entry.name ];

			if ( diff?.also ) {
				expect( [ diff.stored, ...diff.also ] ).toContain( stored );
			} else {
				expect( stored ).toBe( diff?.stored ?? expected[ entry.name ] );
			}
		} );
	}

	test( 'every accepted difference still differs from TinyMCE 4 and states why', () => {
		test.skip( RECORDING );

		for ( const [ name, diff ] of Object.entries( accepted ) ) {
			expect( expected[ name ], name ).not.toBe( diff.stored );
			expect( diff.reason.length, name ).toBeGreaterThan( 10 );
		}
	} );
} );
