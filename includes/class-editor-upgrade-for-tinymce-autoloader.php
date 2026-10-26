<?php
/**
 * Autoloader for Editor Upgrade for TinyMCE plugin
 *
 * @package Editor_Upgrade_For_TinyMCE
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Editor_Upgrade_For_TinyMCE_Autoloader class
 *
 * @package Editor_Upgrade_For_TinyMCE
 */
class Editor_Upgrade_For_TinyMCE_Autoloader {

	/**
	 * Register autoloader
	 */
	public static function register() {
		spl_autoload_register( array( __CLASS__, 'autoload' ) );
	}

	/**
	 * Autoload classes
	 *
	 * Maps Editor_Upgrade_For_TinyMCE to includes/class-editor-upgrade-for-tinymce.php and
	 * Editor_Upgrade_For_TinyMCE_Scripts to includes/class-editor-upgrade-for-tinymce-scripts.php.
	 *
	 * @param string $class_name Class name to load.
	 */
	public static function autoload( $class_name ) {
		if ( strpos( $class_name, 'Editor_Upgrade_For_TinyMCE' ) !== 0 ) {
			return;
		}

		$file_name = strtolower( str_replace( '_', '-', $class_name ) );
		$file_path = EDITOR_UPGRADE_FOR_TINYMCE_PLUGIN_DIR . 'includes/class-' . $file_name . '.php';

		if ( file_exists( $file_path ) ) {
			require_once $file_path;
		}
	}
}
