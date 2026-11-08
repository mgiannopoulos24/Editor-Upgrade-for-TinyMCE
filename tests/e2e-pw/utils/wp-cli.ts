import { execSync } from 'node:child_process';

/** Activate or deactivate a plugin through the wp-env CLI. */
export function setPluginState( plugin: string, active: boolean ) {
	const command = active ? 'activate' : 'deactivate';

	execSync( `bunx wp-env run cli wp plugin ${ command } ${ plugin }`, { stdio: 'ignore' } );
}

/** Forget the Visual/Code tab WordPress remembers for the admin user. */
export function resetEditorTab() {
	try {
		execSync( 'bunx wp-env run cli wp user meta delete 1 wp_user-settings', { stdio: 'ignore' } );
	} catch {
		// The command fails when no setting is stored, which is the state being asked for.
	}
}

/** Read a post's stored content through the wp-env CLI. Browsers submit textareas with CRLF. */
export function getPostContent( postId: string ) {
	return execSync( `bunx wp-env run cli wp post get ${ postId } --field=post_content`, {
		encoding: 'utf8',
		stdio: [ 'ignore', 'pipe', 'ignore' ],
	} ).replace( /\r\n/g, '\n' ).replace( /\n$/, '' );
}
