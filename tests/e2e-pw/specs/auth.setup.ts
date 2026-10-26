import { test as setup } from '@playwright/test';
import { credentials } from './helpers';
import { authFile } from '../playwright.config';

/** Log in once; the desktop project reuses the saved cookies. */
setup( 'log in as admin', async ( { page } ) => {
	await page.goto( '/wp-login.php' );
	await page.fill( '#user_login', credentials.username );
	await page.fill( '#user_pass', credentials.password );
	await page.click( '#wp-submit' );
	await page.waitForURL( /wp-admin/ );
	await page.context().storageState( { path: authFile } );
} );
