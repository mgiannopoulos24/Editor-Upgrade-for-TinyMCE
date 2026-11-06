import type { Page } from '@playwright/test';

export const routes = {
	postNew: '/wp-admin/post-new.php?post_type=post',
} as const;

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
