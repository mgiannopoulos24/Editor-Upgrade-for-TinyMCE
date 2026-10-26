import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Editor Upgrade for TinyMCE end-to-end tests.
 *
 *   bun run test:e2e
 *
 * Expects the wp-env site (bun run start) — it is started if not reachable.
 * The `setup` project logs in once and the specs reuse that session.
 */
const baseURL = process.env.WP_BASE_URL ?? 'http://localhost:8888';

/** Written by auth.setup.ts, reused by every spec. */
export const authFile = path.join( __dirname, '.auth', 'admin.json' );

export default defineConfig( {
	testDir: './specs',
	// Specs share one WordPress install and toggle the same plugins.
	fullyParallel: false,
	workers: 1,
	forbidOnly: !! process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: [
		[ 'list' ],
		[ 'html', { open: 'never', outputFolder: 'playwright-report' } ],
	],
	outputDir: 'test-results',
	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
	},
	projects: [
		{
			name: 'setup',
			testMatch: /auth\.setup\.ts/,
		},
		{
			name: 'desktop',
			use: {
				...devices[ 'Desktop Chrome' ],
				storageState: authFile,
			},
			dependencies: [ 'setup' ],
		},
	],
	webServer: {
		command: 'bun run start',
		url: baseURL,
		reuseExistingServer: true,
		timeout: 300_000,
	},
} );
