/**
 * Compatibility fixture: events_content. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_events_content', function ( editor ) {
	editor.on( 'BeforeSetContent', function ( event ) {
		event.content = event.content.replace( 'before', 'changed-before' );
	} );
	editor.on( 'GetContent', function ( event ) {
		event.content = event.content.replace( 'after', 'changed-after' );
	} );
	editor.on( 'SaveContent', function ( event ) {
		event.content += '<!-- saved -->';
	} );
	editor.on( 'init', function () {
		var custom = 0;

		editor.on( 'compatCustom', function () {
			custom++;
		} );
		editor.fire( 'compatCustom' );
		editor.setContent( '<p>before</p><p>after</p>' );

		var content = editor.getContent();

		compatDone( 'events_content', {
			custom: custom,
			content: content,
			saved: editor.save(),
		} );
	} );
} );
