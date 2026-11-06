<?php
/**
 * Test-only loader for the compatibility fixtures, mapped into wp-env by .wp-env.json.
 *
 * `?compat_fixtures=name` loads one fixture from tests/compat/plugins/ through `mce_external_plugins`,
 * the way real plugins load, and `?compat_fixtures=all` loads every fixture.
 *
 * @package Editor_Upgrade_For_TinyMCE
 */

/**
 * Get the fixtures requested for this page.
 *
 * @return string[]
 */
function compat_fixtures_requested() {
	// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Test-only page.
	$requested = isset( $_GET['compat_fixtures'] ) ? sanitize_key( $_GET['compat_fixtures'] ) : '';

	if ( ! $requested ) {
		return array();
	}

	$directory = WP_PLUGIN_DIR . '/editor-upgrade-for-tinymce/tests/compat/plugins/';
	$available = array_map(
		static function ( $file ) {
			return basename( $file, '.js' );
		},
		(array) glob( $directory . '*.js' )
	);

	return 'all' === $requested ? $available : array_intersect( $available, array( $requested ) );
}

add_filter(
	'mce_external_plugins',
	static function ( $plugins ) {
		foreach ( compat_fixtures_requested() as $name ) {
			$plugins[ 'compat_' . $name ] = content_url( "plugins/editor-upgrade-for-tinymce/tests/compat/plugins/$name.js" );
		}

		return $plugins;
	}
);

add_filter(
	'mce_buttons',
	static function ( $buttons ) {
		foreach ( compat_fixtures_requested() as $name ) {
			$buttons[] = 'compat_' . $name;
		}

		return $buttons;
	}
);

add_action(
	'before_wp_tiny_mce',
	static function () {
		if ( compat_fixtures_requested() ) {
			echo '<script>
				window.compatResults = {};
				window.compatClicks = {};
				window.compatDone = function ( name, value ) { window.compatResults[ name ] = value; };
				window.compatClick = function ( name, labels ) { window.compatClicks[ name ] = labels; };
			</script>';
		}
	}
);
