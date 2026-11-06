/**
 * What TinyMCE 4 stores for each input after Code -> Visual -> save. Recorded on WordPress 7.1.3
 * with this plugin deactivated; update these only against a new recording from TinyMCE 4.
 */
export const V4_BASELINE: Record<string, { input: string; stored?: string }> = {
	paragraphs: { input: 'one\n\ntwo' },
	'empty paragraph': { input: 'one\n\n&nbsp;\n\ntwo' },
	'more tag': { input: 'one\n\n<!--more-->\n\ntwo' },
	'nextpage tag': { input: 'one\n\n<!--nextpage-->\n\ntwo' },
	script: { input: 'one\n\n<script>var a = 1;</script>\n\ntwo' },
	style: { input: 'one\n\n<style>.a{color:red}</style>\n\ntwo' },
	'b and i': { input: 'one <b>bold</b> <i>ital</i>' },
	shortcode: { input: 'one\n\n[gallery ids="1,2"]\n\ntwo' },
	comment: { input: 'one\n\n<!-- note -->\n\ntwo' },
	'list first': {
		input: '<ul>\n <li>a</li>\n <li>b</li>\n</ul>',
		stored: '<ul>\n \t<li>a</li>\n \t<li>b</li>\n</ul>',
	},
	'list between text': {
		input: 'one\n<ul>\n <li>a</li>\n</ul>\ntwo',
		stored: 'one\n<ul>\n \t<li>a</li>\n</ul>\ntwo',
	},
	'table first': { input: '<table>\n<tbody>\n<tr>\n<td>a</td>\n</tr>\n</tbody>\n</table>\n&nbsp;' },
	'void elements': {
		input: 'one<br />two\n<hr />\n<img src="/a.png" alt="" />',
		stored: 'one\ntwo\n\n<hr />\n\n<img src="/a.png" alt="" />',
	},
	attributes: {
		input: '<a href="/x" target="_blank" rel="noopener">l</a> <span style="color: red;" class="c">s</span>',
		stored: '<a href="/x" target="_blank" rel="noopener">l</a> <span class="c" style="color: red;">s</span>',
	},
	entities: { input: 'a &amp; b &lt; c "q" \u00e9' },
	iframe: { input: '<iframe src="https://example.org/" width="10" height="10"></iframe>' },
	caption: {
		input: '[caption id="a" align="alignnone" width="10"]<img src="/a.png" alt="" width="10" height="10" /> cap[/caption]',
	},
	heading: { input: '<h2>Title</h2>\nText' },
	blockquote: { input: '<blockquote>Quote\n\nTwo</blockquote>' },
	pre: { input: '<pre>a\n  b\n\nc</pre>' },
	nestedlist: {
		input: '<ul>\n <li>a\n<ul>\n <li>b</li>\n</ul>\n</li>\n</ul>',
		stored: '<ul>\n 	<li>a\n<ul>\n 	<li>b</li>\n</ul>\n</li>\n</ul>',
	},
	olattrs: {
		input: '<ol start="3" type="a">\n <li value="5">a</li>\n</ol>',
		stored: '<ol start="3" type="a">\n 	<li value="5">a</li>\n</ol>',
	},
	dl: {
		input: '<dl>\n <dt>a</dt>\n <dd>b</dd>\n</dl>',
		stored: '<dl>\n 	<dt>a</dt>\n 	<dd>b</dd>\n</dl>',
	},
	div: { input: '<div class="a">\n\ntext\n\n</div>' },
	emptydiv: { input: 'a\n<div></div>\nb' },
	alignimg: { input: '<img class="alignright size-full wp-image-1" src="/a.png" alt="x" width="10" height="10" />' },
	linkimg: { input: '<a href="/x"><img src="/a.png" alt="" /></a>' },
	audio: {
		input: '<audio controls="controls" src="/a.mp3"></audio>',
		stored: '<audio src="/a.mp3" controls="controls"></audio>',
	},
	video: { input: '<video controls="controls" width="10" height="10"><source src="/a.mp4" type="video/mp4" /></video>' },
	object: { input: '<object data="/a.swf" width="1" height="1"></object>' },
	// TinyMCE 4 wrote <embed></embed>; both parse the same.
	embed: { input: '<embed src="/a.swf" width="1" height="1" />' },
	emptyspan: {
		input: 'a<span class="x"></span>b',
		stored: 'ab',
	},
	svg: {
		input: '<svg width="1" height="1"><circle r="1"></circle></svg>',
		stored: '',
	},
	custom: {
		input: '<my-el data-a="1">x</my-el>',
		stored: 'x',
	},
	dataattr: { input: '<p id="a" class="c" data-x="1">t</p>' },
	form: { input: '<form action="/x"><input name="a" type="text" /></form>' },
	onclick: {
		input: '<a href="/x" onclick="a()">l</a>',
		stored: '<a href="/x">l</a>',
	},
	jsurl: {
		input: '<a href="javascript:alert(1)">l</a>',
		stored: '<a>l</a>',
	},
	tableattrs: { input: '<table class="t" border="1">\n<tbody>\n<tr>\n<td colspan="2">a</td>\n</tr>\n</tbody>\n</table>' },
	brs: {
		input: 'a<br /><br />b',
		stored: 'a\n\nb',
	},
	nbspinline: {
		input: 'a&nbsp;b',
		stored: 'a b',
	},
	entities2: {
		input: '&copy; &mdash; &#8217; &gt;',
		stored: '© — ’ &gt;',
	},
	condcomment: {
		input: 'a\n\n<!--[if IE]>x<![endif]-->\n\nb',
		stored: 'a\n\n<!-- [if IE]>x<![endif]-->\n\nb',
	},
	tagcomment: { input: 'a\n\n<!-- <b>x</b> -->\n\nb' },
	shortcodehtml: { input: '[x a="1"]<strong>b</strong>[/x]' },
	section: {
		input: '<section class="s">\n\ntext\n\n</section>',
		stored: '<section class="s">text\n\n</section>',
	},
	details: {
		input: '<details><summary>a</summary>b</details>',
		stored: '<details><summary>a</summary>b\n\n</details>',
	},
	font: {
		input: '<font color="red">x</font> <u>y</u> <s>z</s> <del>d</del> <ins>i</ins>',
		stored: '<span style="color: red;">x</span> <u>y</u> <s>z</s> <del>d</del> <ins>i</ins>',
	},
	center: { input: '<center>x</center>' },
	// TinyMCE 4 lowercased hex colors.
	styleattr: { input: '<p style="text-align: center; color: #FF0000;">x</p>' },
	imgentity: { input: '<a title="a &amp; b" href="/x?a=1&amp;b=2">l</a>' },
	script2: { input: '<script src="/a.js" async></script>' },
	morecustom: { input: 'a<!--more Read on-->b' },
	noscript: { input: '<noscript>x</noscript>' },
	iframeinline: { input: 'a <iframe src="https://example.org/" width="1" height="1"></iframe> b' },
};
