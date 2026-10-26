<?php
/**
 * Script registration
 *
 * @package Editor_Upgrade_For_TinyMCE
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Editor_Upgrade_For_TinyMCE_Scripts class
 *
 * Points the core `wp-tinymce-root`, `wp-tinymce` and `wp-tinymce-lists` handles at the
 * bundled TinyMCE 8 and the compat4x layer. Mirrors `wp_register_tinymce_scripts()` in core.
 *
 * @package Editor_Upgrade_For_TinyMCE
 */
class Editor_Upgrade_For_TinyMCE_Scripts {

	/**
	 * Constructor
	 */
	public function __construct() {
		// Core registers the TinyMCE handles on `wp_default_scripts` at the default priority.
		add_action( 'wp_default_scripts', array( $this, 'replace_scripts' ), 20 );
	}

	/**
	 * Replace the core TinyMCE handles
	 *
	 * @param WP_Scripts $scripts WP_Scripts object.
	 */
	public function replace_scripts( $scripts ) {
		$version      = Editor_Upgrade_For_TinyMCE::get_asset_version();
		$tinymce_url  = Editor_Upgrade_For_TinyMCE::get_tinymce_url();
		$suffix       = Editor_Upgrade_For_TinyMCE::get_suffix();
		$script_debug = defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG;

		$handles = array(
			'wp-tinymce-root'  => array(
				'src'  => "$tinymce_url/tinymce$suffix.js",
				'deps' => array(),
			),
			'wp-tinymce'       => array(
				'src'  => EDITOR_UPGRADE_FOR_TINYMCE_PLUGIN_URL . 'assets/js/compat4x.js',
				'deps' => array( 'jquery', 'wp-tinymce-root' ),
			),
			'wp-tinymce-lists' => array(
				'src'  => "$tinymce_url/plugins/lists/plugin$suffix.js",
				'deps' => array( 'wp-tinymce' ),
			),
		);

		/*
		 * Before WordPress 7.2, `wp-tinymce` was a single bundle and `wp-tinymce-root` did not
		 * exist, so every handle is re-registered with the expected dependencies.
		 */
		foreach ( $handles as $handle => $script ) {
			$scripts->remove( $handle );
			$scripts->add( $handle, $script['src'], $script['deps'], $version );
		}

		$scripts->add_inline_script(
			'wp-tinymce',
			'window.editorUpgradeForTinyMCE = ' . wp_json_encode(
				array(
					'baseUrl'     => $tinymce_url,
					'suffix'      => $suffix,
					'cacheSuffix' => 'wp-mce-' . $version,
					'plugins'     => Editor_Upgrade_For_TinyMCE::get_available_plugins(),
					'debug'       => $script_debug,
				),
				JSON_HEX_TAG | JSON_UNESCAPED_SLASHES
			) . ';',
			'before'
		);
	}
}
