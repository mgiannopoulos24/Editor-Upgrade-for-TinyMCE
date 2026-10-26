<?php
/**
 * Plugin Name: Editor Upgrade for TinyMCE
 * Description: Replaces the TinyMCE 4 editor bundled with WordPress with TinyMCE 8, with a compatibility layer for TinyMCE 4 plugins.
 * Version: 0.1.0
 * Requires at least: 6.5
 * Tested up to:      7.1.3
 * Requires PHP:      8.1
 * Author: Marios Giannopoulos
 * Author URI: https://github.com/mgiannopoulos24
 * License: GNU General Public License v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: editor-upgrade-for-tinymce
 * Domain Path: /languages
 *
 * @package Editor_Upgrade_For_TinyMCE
 */

/**
 * Exit if accessed directly
 */
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Define plugin constants
 */
define( 'EDITOR_UPGRADE_FOR_TINYMCE_VERSION', '0.1.0' );
define( 'EDITOR_UPGRADE_FOR_TINYMCE_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'EDITOR_UPGRADE_FOR_TINYMCE_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'EDITOR_UPGRADE_FOR_TINYMCE_PLUGIN_BASENAME', plugin_basename( __FILE__ ) );

/**
 * Autoloader
 */
require_once EDITOR_UPGRADE_FOR_TINYMCE_PLUGIN_DIR . 'includes/class-editor-upgrade-for-tinymce-autoloader.php';
Editor_Upgrade_For_TinyMCE_Autoloader::register();

/**
 * Get the main plugin instance
 *
 * @return Editor_Upgrade_For_TinyMCE
 */
function editor_upgrade_for_tinymce() {
	return Editor_Upgrade_For_TinyMCE::get_instance();
}

/**
 * Initialize the plugin
 */
editor_upgrade_for_tinymce();
