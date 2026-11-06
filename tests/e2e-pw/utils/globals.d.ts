/**
 * The parts of WordPress's TinyMCE globals the e2e specs read.
 */
interface TinyMCEV4Control {
	settings: Record<string, unknown>;
	visible( state: boolean ): TinyMCEV4Control;
	text( value: string ): TinyMCEV4Control;
}

interface TinyMCEV4ButtonSpec {
	text?: string;
	cmd?: string;
	onclick?( this: TinyMCEV4Control ): void;
}

interface TinyMCEEditor {
	settings: {
		license_key?: string;
		api_key?: string;
		forced_root_block?: string;
	};
	buttons: Record<string, TinyMCEV4ButtonSpec>;
	plugins: Record<string, unknown>;
	ui: { registry: { getAll(): { buttons: Record<string, unknown> } } };
	dom: { select( selector: string ): Element[] };
	selection: { select( node: Element ): void };
	addButton( name: string, spec: TinyMCEV4ButtonSpec ): void;
	getContent(): string;
	setContent( content: string ): void;
	save(): string;
	remove(): void;
	initialized: boolean;
	focus(): void;
	execCommand( command: string ): void;
	nodeChanged(): void;
}

interface TinyMCE {
	majorVersion: string;
	activeEditor: TinyMCEEditor;
	Env: { browser: { isIE(): boolean } };
	get( id: string ): TinyMCEEditor;
	PluginManager: { add( name: string, plugin: () => object ): void };
	init( settings: Record<string, unknown> & { setup?( editor: TinyMCEEditor ): void } ): Promise<TinyMCEEditor[]>;
}

interface Window {
	wp: {
		data: { dispatch( store: string ): { insertBlocks( block: unknown ): void } };
		blocks: { createBlock( name: string ): unknown };
	};
	jQuery( target: Document ): {
		on( events: string, handler: ( event: { type: string }, editor: { id: string } ) => void ): void;
	};
	tinymce: TinyMCE;
	compat4xLog: string[];
	dialogProbe(): Promise<string[]>;
	utilProbe( echoUrl: string ): Promise<string[]>;
	compat4xControl: TinyMCEV4Control;
}
