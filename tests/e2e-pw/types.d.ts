/**
 * The parts of WordPress's TinyMCE globals the e2e specs read.
 */
interface TinyMCEV4Control {
	settings: Record<string, unknown>;
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
	};
	buttons: Record<string, TinyMCEV4ButtonSpec>;
	ui: { registry: { getAll(): { buttons: Record<string, unknown> } } };
	dom: { select( selector: string ): Element[] };
	selection: { select( node: Element ): void };
	addButton( name: string, spec: TinyMCEV4ButtonSpec ): void;
	getContent(): string;
	setContent( content: string ): void;
	save(): string;
	nodeChanged(): void;
}

interface TinyMCE {
	majorVersion: string;
	get( id: string ): TinyMCEEditor;
	init( settings: Record<string, unknown> & { setup?( editor: TinyMCEEditor ): void } ): Promise<TinyMCEEditor[]>;
}

interface Window {
	jQuery( target: Document ): {
		on( events: string, handler: ( event: { type: string }, editor: { id: string } ) => void ): void;
	};
	tinymce: TinyMCE;
	compat4xLog: string[];
}
