<?php
/**
 * Main plugin class
 *
 * @package Editor_Upgrade_For_TinyMCE
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Editor_Upgrade_For_TinyMCE class
 *
 * @package Editor_Upgrade_For_TinyMCE
 */
class Editor_Upgrade_For_TinyMCE {

	/**
	 * Plugin instance
	 *
	 * @var Editor_Upgrade_For_TinyMCE
	 */
	private static $instance = null;

	/**
	 * Scripts instance
	 *
	 * @var Editor_Upgrade_For_TinyMCE_Scripts
	 */
	public $scripts;

	/**
	 * Settings instance
	 *
	 * @var Editor_Upgrade_For_TinyMCE_Settings
	 */
	public $settings;

	/**
	 * Get plugin instance
	 *
	 * @return Editor_Upgrade_For_TinyMCE
	 */
	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor
	 */
	private function __construct() {
		$this->scripts  = new Editor_Upgrade_For_TinyMCE_Scripts();
		$this->settings = new Editor_Upgrade_For_TinyMCE_Settings();
	}

	/**
	 * Get the bundled TinyMCE version
	 *
	 * @return string
	 */
	public static function get_tinymce_version() {
		static $version = null;

		if ( null === $version ) {
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local file bundled with the plugin.
			$version = trim( (string) file_get_contents( EDITOR_UPGRADE_FOR_TINYMCE_PLUGIN_DIR . 'assets/vendor/tinymce/VERSION' ) );
		}

		return $version;
	}

	/**
	 * Get the base URL of the bundled TinyMCE, without a trailing slash
	 *
	 * @return string
	 */
	public static function get_tinymce_url() {
		return EDITOR_UPGRADE_FOR_TINYMCE_PLUGIN_URL . 'assets/vendor/tinymce';
	}

	/**
	 * Get the script suffix: empty with SCRIPT_DEBUG, '.min' otherwise
	 *
	 * @return string
	 */
	public static function get_suffix() {
		return ( defined( 'SCRIPT_DEBUG' ) && SCRIPT_DEBUG ) ? '' : '.min';
	}

	/**
	 * Get the version string used for cache busting
	 *
	 * @return string
	 */
	public static function get_asset_version() {
		return self::get_tinymce_version() . '-' . EDITOR_UPGRADE_FOR_TINYMCE_VERSION;
	}

	/**
	 * Get the names of the plugins bundled with TinyMCE 8
	 *
	 * @return string[]
	 */
	public static function get_available_plugins() {
		static $plugins = null;

		if ( null === $plugins ) {
			$plugins = array_map( 'basename', glob( EDITOR_UPGRADE_FOR_TINYMCE_PLUGIN_DIR . 'assets/vendor/tinymce/plugins/*', GLOB_ONLYDIR ) );
		}

		return $plugins;
	}
}
