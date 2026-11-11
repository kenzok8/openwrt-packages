'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const baseclass = { extend: value => value };
const markdown = new Function('baseclass', fs.readFileSync('htdocs/luci-static/resources/carbon/markdown.js', 'utf8'))(baseclass);

test('formats real release notes including headings, lists, tables and fenced commands', () => {
	const notes = fs.readFileSync('docs/releases/v1.1.2.md', 'utf8') + '\n\n| Firmware | File |\n|---|---|\n| APK | `carbon.apk` |\n\n```sh\nopkg install carbon.ipk\n```';
	const html = markdown.render(notes);
	for (const pattern of [/<h3>v1\.1\.2<\/h3>/, /<ul>/, /<li>/, /<strong>升级：<\/strong>/, /<table>/, /<code>carbon\.apk<\/code>/, /<pre><code class="language-sh">opkg install carbon\.ipk/])
		assert.match(html, pattern);
});

test('supports nested lists, quotations, emphasis, references and automatic links', () => {
	const html = markdown.render('1. **First**\n   - *Nested* and ~~old~~\n\n> Quote\n\n[Manual][docs]\n\n[docs]: https://example.com/guide\n\nhttps://example.com/update');
	for (const pattern of [/<ol>/, /<ul>/, /<em>Nested<\/em>/, /<s>old<\/s>/, /<blockquote>/, /href="https:\/\/example.com\/guide"/, /href="https:\/\/example.com\/update"/])
		assert.match(html, pattern);
});

test('raw HTML, SVG, event handlers and code examples remain inert text', () => {
	const html = markdown.render('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<svg onload=alert(1)></svg>\n\n<iframe srcdoc="<script>alert(1)</script>"></iframe>\n\n```html\n<img src=x onerror=alert(1)>\n```');
	assert.doesNotMatch(html, /<(?:script|img|svg|iframe)\b/i);
	assert.match(html, /&lt;script&gt;/);
	assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('rejects script, data, file and encoded unsafe URLs in links and images', () => {
	for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'javascript&#58;alert(1)', 'java&#10;script:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox(1)', 'file:///etc/passwd', 'data:image/svg+xml;base64,PHN2Zz4=']) {
		const html = markdown.render(`[unsafe](${url})\n\n![unsafe](${url})`);
		assert.doesNotMatch(html, /<(?:a|img)\b/i, url);
	}
});

test('opens safe links separately and resolves relative paths away from the router', () => {
	const html = markdown.render('[Docs](docs/apk-install.md) [Web](https://example.com/?a=1&b=2) [Mail](mailto:test@example.com)');
	assert.match(html, /href="https:\/\/github.com\/mrjoechen\/luci-theme-carbon\/blob\/main\/docs\/apk-install.md"/);
	assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, 3);
	assert.match(html, /a=1&amp;b=2/);
});

test('safe images are lazy loaded without a router referrer', () => {
	const html = markdown.render('![Preview](https://example.com/preview.png "Carbon")');
	assert.match(html, /<img src="https:\/\/example.com\/preview.png"/);
	assert.match(html, /alt="Preview"/);
	assert.match(html, /loading="lazy"/);
	assert.match(html, /referrerpolicy="no-referrer"/);
});

test('empty or malformed Markdown has a stable text rendering', () => {
	assert.equal(markdown.render(null), '');
	assert.equal(markdown.render(''), '');
	assert.match(markdown.render('**unfinished [link](\n\nA & B < C'), /A &amp; B &lt; C/);
});

test('setext headings, rules, table alignment and ordered list start', () => {
	const html = markdown.render('Title\n=====\n\nSub\n---\n\n***\n\n| L | C | R |\n|:--|:-:|--:|\n| a \\| b | c | d |\n\n3. three\n4. four');
	for (const pattern of [/<h1>Title<\/h1>/, /<h2>Sub<\/h2>/, /<hr>/, /<th style="text-align:left">L<\/th>/, /<th style="text-align:center">C<\/th>/,
		/<td style="text-align:right">d<\/td>/, /<td style="text-align:left">a \| b<\/td>/, /<ol start="3">/])
		assert.match(html, pattern);
});

test('tight lists stay inline, loose lists get paragraphs', () => {
	assert.match(markdown.render('- a\n- b'), /<li>a<\/li>\n<li>b<\/li>/);
	assert.match(markdown.render('- a\n\n- b'), /<li><p>a<\/p><\/li>\n<li><p>b<\/p><\/li>/);
	assert.match(markdown.render('- a\ncontinued\n- b'), /<li>a\ncontinued<\/li>/);
});

test('escapes, code spans and URL punctuation', () => {
	assert.equal(markdown.render('\\*not em\\* `**not strong**` **strong** _em_ snake_case_name'),
		'<p>*not em* <code>**not strong**</code> <strong>strong</strong> <em>em</em> snake_case_name</p>\n');
	assert.match(markdown.render('See https://example.com/a.'), /href="https:\/\/example.com\/a"[^>]*>https:\/\/example.com\/a<\/a>\.<\/p>/);
	assert.match(markdown.render('line one  \nline two'), /line one<br>\nline two/);
});

test('deep nesting and pathological input stay bounded', () => {
	const t = Date.now();
	assert.match(markdown.render('>'.repeat(500) + ' deep'), /deep/);
	for (const s of ['['.repeat(12000), '**'.repeat(6000), '_a '.repeat(4000), '[a]('.repeat(3000), '`'.repeat(12000)]) markdown.render(s);
	assert.ok(Date.now() - t < 2000, 'renders in under 2 s');
});

test('status polling keeps the notes DOM, selection and scroll when content is unchanged', async () => {
	let writes = 0;
	function E(tag, attrs = {}, children) {
		let html = '', text = '';
		return { tag, attrs, children, hidden: false,
			set innerHTML(value) { html = value; if (attrs.class === 'cb-release-notes') writes++; },
			get innerHTML() { return html; },
			set textContent(value) { text = value; }, get textContent() { return text; }
		};
	}
	let current = { current: '1.1.2-r1', notes: '# First', manager: 'apk' };
	const subject = new Function('view', 'rpc', 'poll', 'ui', 'markdown', 'document', 'E', 'L', 'window', '_', fs.readFileSync('htdocs/luci-static/resources/view/system/carbon-update.js', 'utf8'))(
		baseclass, { declare: () => async () => current }, { add() {} }, {}, markdown,
		{ documentElement: { lang: 'zh' }, querySelectorAll: () => [] }, E, { hasViewPermission: () => true }, {}, s => s);
	subject.render(current);
	assert.equal(writes, 1);
	await subject.pollStatus();
	assert.equal(writes, 1);
	current = { ...current, notes: '# Second' };
	await subject.pollStatus();
	assert.equal(writes, 2);
});
