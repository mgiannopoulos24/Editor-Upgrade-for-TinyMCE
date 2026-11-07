const V4_ENV_COMMON = {
	opera: false,
	ie: false,
	iOS: false,
	android: false,
	contentEditable: true,
	caretAfter: true,
	range: true,
	documentMode: 10,
	fileApi: true,
	ceFalse: true,
	overrideViewPort: null,
	experimentalShadowDom: false,
	canHaveCSP: true,
	desktop: true,
	windowsPhone: false,
};

/** `tinymce.Env` and the `tinymce.is*` flags on real TinyMCE 4, per Playwright browser. */
export const V4_ENV = {
	chromium: {
		env: { ...V4_ENV_COMMON, webkit: true, gecko: false, mac: false },
		globals: { isOpera: false, isWebKit: true, isIE: false, isGecko: false, isMac: false },
	},
	firefox: {
		env: { ...V4_ENV_COMMON, webkit: false, gecko: true, mac: false },
		globals: { isOpera: false, isWebKit: false, isIE: false, isGecko: true, isMac: false },
	},
	webkit: {
		env: { ...V4_ENV_COMMON, webkit: true, gecko: false, mac: true },
		globals: { isOpera: false, isWebKit: true, isIE: false, isGecko: false, isMac: true },
	},
};
