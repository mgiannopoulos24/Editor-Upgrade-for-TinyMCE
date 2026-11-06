/**
 * Compatibility fixture: legacy_events. Written against the TinyMCE 4 API.
 */
tinymce.PluginManager.add( 'compat_legacy_events', function ( editor ) {
	var log = {};

	function count( name ) {
		return function () {
			log[ name ] = ( log[ name ] || 0 ) + 1;
		};
	}

	tinymce.onAddEditor.add( count( 'addEditorDispatcher' ) );
	editor.onPreInit.add( count( 'preInit' ) );
	editor.onInit.add( function ( ed ) {
		log.initEditor = ed === editor;
	} );
	editor.onNodeChange.add( function ( ed, controlManager, element, collapsed ) {
		log.nodeChange = [ ed === editor, !! controlManager, element.nodeName.length > 0, typeof collapsed ];
	} );
	editor.onBeforeSetContent.add( function ( ed, event ) {
		event.content = event.content.replace( 'old', 'new' );
	} );
	editor.onExecCommand.add( function ( ed, command ) {
		if ( 'compatLegacy' === command ) {
			log.exec = command;
		}
	} );
	editor.addCommand( 'compatLegacy', function () {} );

	var removed = count( 'removed' );

	editor.onKeyDown.add( removed );
	editor.onKeyDown.remove( removed );

	editor.on( 'init', function () {
		editor.selection.onSetContent.add( count( 'selectionSet' ) );
		editor.undoManager.onAdd.add( count( 'undoAdd' ) );
		editor.setContent( '<p>old</p>' );
		log.content = editor.getContent();
		editor.selection.select( editor.getBody().firstChild );
		editor.selection.setContent( '<p>sel</p>' );
		editor.nodeChanged();
		editor.execCommand( 'compatLegacy' );
		editor.fire( 'KeyDown', { keyCode: 65 } );
		editor.undoManager.add();
		log.dispatcher = typeof tinymce.util.Dispatcher;
		log.cookie = typeof tinymce.util.Cookie.get;
		log.undo = typeof editor.undoManager.onUndo.add;
		log.windowOpen = typeof editor.windowManager.onOpen.add;
		log.createInstance = typeof editor.windowManager.createInstance;
		log.setActive = typeof editor.controlManager.setActive;
		log.createButton = typeof editor.controlManager.createButton().setDisabled;
		compatDone( 'legacy_events', log );
	} );
} );
