<?php
/**
 * Test-only helpers, mapped into wp-env by .wp-env.json. Not part of the plugin.
 *
 * Adds the editor surfaces the e2e suite cannot reach on a default install: a widget area with the
 * classic widgets screen, and front-end `wp_editor()` pages (`/?eu_test_editor=default|teeny`).
 *
 * @package Editor_Upgrade_For_TinyMCE
 */

add_filter( 'use_widgets_block_editor', '__return_false' );

add_action(
	'widgets_init',
	static function () {
		register_sidebar(
			array(
				'id'   => 'eu-test-sidebar',
				'name' => 'Test Sidebar',
			)
		);
	}
);

add_action(
	'template_redirect',
	static function () {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Test-only page.
		$mode = isset( $_GET['eu_test_editor'] ) ? sanitize_key( $_GET['eu_test_editor'] ) : '';

		if ( ! $mode ) {
			return;
		}

		echo '<!doctype html><html><head>';
		wp_head();
		echo '</head><body>';
		wp_editor( '<p>Front end</p>', 'euTestEditor', array( 'teeny' => 'teeny' === $mode ) );
		wp_footer();
		echo '</body></html>';
		exit;
	}
);
