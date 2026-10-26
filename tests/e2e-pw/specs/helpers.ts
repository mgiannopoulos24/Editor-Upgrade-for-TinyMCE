import { execSync } from 'node:child_process';
import type { Page } from '@playwright/test';

/** wp-env's default admin account. */
export const credentials = {
	username: process.env.WP_USERNAME ?? 'admin',
	password: process.env.WP_PASSWORD ?? 'password',
};

export const routes = {
	postNew: '/wp-admin/post-new.php?post_type=post',
} as const;

/** Activate or deactivate a plugin through the wp-env CLI. */
export function setPluginState( plugin: string, active: boolean ) {
	const command = active ? 'activate' : 'deactivate';

	execSync( `bunx wp-env run cli wp plugin ${ command } ${ plugin }`, { stdio: 'ignore' } );
}

/** Collect uncaught exceptions and `console.error()` calls for the whole test. */
export function collectErrors( page: Page ) {
	const errors: string[] = [];

	page.on( 'pageerror', ( error ) => errors.push( error.message ) );
	page.on( 'console', ( message ) => {
		if ( message.type() === 'error' ) {
			errors.push( message.text() );
		}
	} );

	return errors;
}
