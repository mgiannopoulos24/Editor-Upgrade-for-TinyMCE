/**
 * The parts of WordPress's TinyMCE globals the e2e specs read.
 */
interface TinyMCEEditor {
	settings: {
		license_key?: string;
		api_key?: string;
	};
}

interface TinyMCE {
	majorVersion: string;
	get( id: string ): TinyMCEEditor;
}

interface Window {
	tinymce: TinyMCE;
}
