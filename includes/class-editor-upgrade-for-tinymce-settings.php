<?php
/**
 * Editor settings
 *
 * @package Editor_Upgrade_For_TinyMCE
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Editor_Upgrade_For_TinyMCE_Settings class
 *
 * Adapts the TinyMCE 4 settings built by `WP_Editor` and `wp_tinymce_inline_scripts()` to
 * TinyMCE 8. Settings printed without a filter (`wp.editor.getDefaultSettings()`, used by the
 * Text widget) are adapted by compat4x, which applies the same rules to every `tinymce.init()`.
 *
 * @package Editor_Upgrade_For_TinyMCE
 */
class Editor_Upgrade_For_TinyMCE_Settings {

	/**
	 * Constructor
	 */
	public function __construct() {
		// Run last so the result reflects every other plugin's changes.
		add_filter( 'tiny_mce_plugins', array( $this, 'filter_plugins' ), PHP_INT_MAX );
		add_filter( 'teeny_mce_plugins', array( $this, 'filter_plugins' ), PHP_INT_MAX );
		add_filter( 'tiny_mce_before_init', array( $this, 'filter_settings' ), PHP_INT_MAX, 2 );
		add_filter( 'teeny_mce_before_init', array( $this, 'filter_settings' ), PHP_INT_MAX, 2 );
	}

	/**
	 * Remove plugins that do not exist in TinyMCE 8
	 *
	 * Drops TinyMCE 4 plugins removed upstream (colorpicker, hr, paste, tabfocus, textcolor) and
	 * the WordPress `wp*` plugins until they are ported. Plugins added with `mce_external_plugins`
	 * are not affected.
	 *
	 * @param string[] $plugins Internal TinyMCE plugin names.
	 * @return string[]
	 */
	public function filter_plugins( $plugins ) {
		return array_values( array_intersect( (array) $plugins, Editor_Upgrade_For_TinyMCE::get_available_plugins() ) );
	}

	/**
	 * Adapt the TinyMCE settings to TinyMCE 8
	 *
	 * @param array  $settings  TinyMCE settings.
	 * @param string $editor_id Editor ID, or 'classic-block'.
	 * @return array
	 */
	public function filter_settings( $settings, $editor_id = '' ) {
		$settings['base_url']     = Editor_Upgrade_For_TinyMCE::get_tinymce_url();
		$settings['suffix']       = Editor_Upgrade_For_TinyMCE::get_suffix();
		$settings['cache_suffix'] = 'wp-mce-' . Editor_Upgrade_For_TinyMCE::get_asset_version();
		$settings['promotion']    = false;
		$settings['branding']     = false;

		if ( empty( $settings['theme'] ) || in_array( $settings['theme'], array( 'modern', 'inlite' ), true ) ) {
			$settings['theme'] = 'silver';
		}

		if ( isset( $settings['skin'] ) && 'lightgray' === $settings['skin'] ) {
			$settings['skin'] = 'oxide';
		}

		// Removed in TinyMCE 8 and no longer used by WordPress; v8 warns at init.
		unset( $settings['tabfocus_elements'] );

		// The v4 resize option allowed a vertical value. TinyMCE 8 does not, so use a boolean.
		if ( isset( $settings['resize'] ) && 'vertical' === $settings['resize'] ) {
			$settings['resize'] = true;
		}

		$settings = $this->normalize_toolbars( $settings );
		$settings = $this->normalize_external_plugins( $settings );

		return $this->apply_license_rules( $settings, $editor_id );
	}

	/**
	 * Normalize toolbar settings for TinyMCE 8
	 *
	 * TinyMCE 8 expects toolbar items separated by spaces, while TinyMCE 4 (and WordPress)
	 * separate them with commas. A comma-separated row is read as a single unknown item and
	 * renders as an empty toolbar. Buttons renamed after TinyMCE 4 are mapped to their new names.
	 *
	 * @param array $settings TinyMCE settings.
	 * @return array
	 */
	private function normalize_toolbars( $settings ) {
		$names = array( 'toolbar' );

		for ( $i = 1; $i <= 9; $i++ ) {
			$names[] = 'toolbar' . $i;
		}

		foreach ( $names as $name ) {
			if ( isset( $settings[ $name ] ) ) {
				$settings[ $name ] = $this->normalize_toolbar( $settings[ $name ] );
			}
		}

		return $settings;
	}

	/**
	 * Normalize a single toolbar setting
	 *
	 * `toolbar` accepts a string or an array of strings (one row per entry); `toolbar1`..`toolbar9`
	 * are strings.
	 *
	 * @param string|string[] $toolbar Toolbar setting.
	 * @return string|string[]
	 */
	private function normalize_toolbar( $toolbar ) {
		if ( is_string( $toolbar ) ) {
			$items = preg_split( '/[\s,]+/', $toolbar, -1, PREG_SPLIT_NO_EMPTY );

			return implode( ' ', array_map( array( $this, 'normalize_toolbar_item' ), $items ) );
		}

		if ( is_array( $toolbar ) ) {
			return array_map( array( $this, 'normalize_toolbar' ), $toolbar );
		}

		return $toolbar;
	}

	/**
	 * Rename a TinyMCE 4 toolbar item to its TinyMCE 8 name
	 *
	 * @param string $item Toolbar item name.
	 * @return string
	 */
	private function normalize_toolbar_item( $item ) {
		$renamed = array(
			'formatselect'   => 'blocks',
			'styleselect'    => 'styles',
			'fontselect'     => 'fontfamily',
			'fontsizeselect' => 'fontsize',
		);

		return isset( $renamed[ $item ] ) ? $renamed[ $item ] : $item;
	}

	/**
	 * Normalize `external_plugins` to an object
	 *
	 * Core prints an empty list as a JSON array (`[]`), and some plugins pass a PHP array. TinyMCE
	 * 8 only accepts an object and drops an array, which then crashes its license key manager.
	 *
	 * @param array $settings TinyMCE settings.
	 * @return array
	 */
	private function normalize_external_plugins( $settings ) {
		if ( ! isset( $settings['external_plugins'] ) ) {
			return $settings;
		}

		$external_plugins = $settings['external_plugins'];

		if ( is_string( $external_plugins ) ) {
			$external_plugins = json_decode( $external_plugins, true );
		}

		if ( is_array( $external_plugins ) ) {
			$settings['external_plugins'] = wp_json_encode( (object) $external_plugins );
		}

		return $settings;
	}

	/**
	 * Make sure the license settings cannot disable the editor
	 *
	 * TinyMCE 8 disables the editor unless `license_key` is 'gpl' and no `api_key` is set, or the
	 * commercial `licensekeymanager` plugin is loaded. Non-GPL keys are left alone.
	 *
	 * @param array  $settings  TinyMCE settings.
	 * @param string $editor_id Editor ID, or 'classic-block'.
	 * @return array
	 */
	private function apply_license_rules( $settings, $editor_id ) {
		if ( ! isset( $settings['license_key'] ) || '' === $settings['license_key'] ) {
			$settings['license_key'] = 'gpl';
		}

		if ( 'gpl' === strtolower( $settings['license_key'] ) && ! empty( $settings['api_key'] ) ) {
			unset( $settings['api_key'] );

			_doing_it_wrong(
				'tiny_mce_before_init',
				esc_html(
					sprintf(
						/* translators: %s: Editor ID. */
						__( 'An "api_key" was set for the "%s" editor together with the GPL license key. TinyMCE 8 would disable the editor, so the "api_key" was removed.', 'editor-upgrade-for-tinymce' ),
						$editor_id
					)
				),
				'0.1.0'
			);
		}

		return $settings;
	}
}
