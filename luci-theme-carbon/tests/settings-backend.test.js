'use strict';
/*
 * Theme settings backend (root/usr/libexec/rpcd/luci.carbon_update): custom
 * logo. The real shell functions run with a minimal jshn stand-in and
 * temporary paths.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'root/usr/libexec/rpcd/luci.carbon_update'), 'utf8');

const JSHN = path.join(__dirname, 'shell-stubs', 'jshn.sh');

function backend() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbon-logo-'));
	const body = SCRIPT
		.replace('. /usr/share/libubox/jshn.sh', `. "${JSHN}"`)
		.replace(/\ncase "\$1" in\n\tlist\)[\s\S]*$/, '\n');
	assert.notEqual(body, SCRIPT, 'dispatch block stripped');
	const lib = path.join(dir, 'backend.sh');
	fs.writeFileSync(lib, body + `\nlogo_dir="${dir}/www/custom"\nlogo_upload="${dir}/upload"\n`);
	const call = (action) => JSON.parse(execFileSync(process.env.CARBON_TEST_SH || 'sh', ['-c', `. "${lib}"; input='{"action":"${action}"}'; logo`], { encoding: 'utf8' }));
	const upload = (data) => fs.writeFileSync(path.join(dir, 'upload'), data);
	const files = () => fs.existsSync(path.join(dir, 'www/custom')) ? fs.readdirSync(path.join(dir, 'www/custom')).sort() : [];
	return { dir, call, upload, files, uploaded: () => fs.existsSync(path.join(dir, 'upload')) };
}

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), Buffer.alloc(64)]);
const JPEG = Buffer.concat([Buffer.from('ffd8ffe000104a464946', 'hex'), Buffer.alloc(64)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from('24000000', 'hex'), Buffer.from('WEBPVP8 '), Buffer.alloc(32)]);
const SVG = '<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n' +
	'<SVG xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#4F5BEA"/>' +
	'<text font-family="Montserrat" x="8" y="40">Carbon one</text></SVG>';

test('a PNG upload becomes the logo; a later JPEG replaces it', () => {
	const b = backend();
	b.upload(PNG);
	const r = b.call('set');
	assert.match(r.logo, /^\/luci-static\/carbon\/custom\/logo\.png(\?v=\d+)?$/);
	assert.deepEqual(b.files(), ['logo.png']);
	assert.equal(b.uploaded(), false, 'upload is consumed');
	b.upload(JPEG);
	assert.match(b.call('set').logo, /logo\.jpg/);
	assert.deepEqual(b.files(), ['logo.jpg']);
	assert.equal(fs.statSync(path.join(b.dir, 'www/custom/logo.jpg')).mode & 0o777, 0o644);
	b.upload(WEBP);
	assert.match(b.call('set').logo, /logo\.webp/);
});

test('the image type comes from the content, never the file name', () => {
	const b = backend();
	b.upload('GIF89a' + '\0'.repeat(40));
	assert.match(b.call('set').logo, /logo\.gif/);
	b.upload('<html><body>not an image</body></html>');
	assert.deepEqual(b.call('set'), { error: 'logo_type' });
	assert.deepEqual(b.files(), ['logo.gif'], 'a rejected upload keeps the current logo');
	assert.equal(b.uploaded(), false);
});

test('size limits: empty and over 256 KB are rejected', () => {
	const b = backend();
	b.upload('');
	assert.deepEqual(b.call('set'), { error: 'logo_size' });
	b.upload(Buffer.concat([PNG, Buffer.alloc(262144)]));
	assert.deepEqual(b.call('set'), { error: 'logo_size' });
	assert.deepEqual(b.call('set'), { error: 'logo_missing' }, 'nothing left to apply');
});

test('plain SVG logos are accepted, including DOCTYPE and raster data: images', () => {
	const b = backend();
	b.upload(SVG);
	assert.match(b.call('set').logo, /logo\.svg/);
	b.upload('<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,iVBORw0KGgo="/></svg>');
	assert.match(b.call('set').logo, /logo\.svg/);
});

test('SVG that could run script on the LuCI origin is rejected', () => {
	const unsafe = [
		'<svg><script>alert(1)</script></svg>',
		'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
		'<svg>\n<rect\n\tONCLICK = "x()"/></svg>',
		'<svg><foreignObject><iframe src="x"/></foreignObject></svg>',
		'<svg><a href="javascript:alert(1)"><rect/></a></svg>',
		'<svg><a xlink:href="https://example.com"><rect/></a></svg>',
		'<svg><set attributeName="href" to="x"/></svg>',
		'<svg><animate attributeName="href" values="x"/></svg>',
		'<svg><image href="&#106;avascript:x"/></svg>',
		'<!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>',
		'<svg><use href="data:image/svg+xml;base64,PHN2Zz4="/></svg>',
		'<svg><embed src="x"/></svg>'
	];
	const b = backend();
	unsafe.forEach((svg) => {
		b.upload(svg);
		assert.deepEqual(b.call('set'), { error: 'logo_unsafe' }, svg);
	});
	assert.deepEqual(b.files(), []);
});

test('reset restores the default logo and removes the directory', () => {
	const b = backend();
	b.upload(PNG);
	b.call('set');
	assert.deepEqual(b.call('reset'), { logo: '' });
	assert.equal(fs.existsSync(path.join(b.dir, 'www/custom')), false);
	assert.deepEqual(b.call('reset'), { logo: '' }, 'idempotent');
	assert.deepEqual(b.call('bogus'), { error: 'invalid' });
});

test('a symlinked upload is refused', () => {
	const b = backend();
	fs.writeFileSync(path.join(b.dir, 'secret'), PNG);
	fs.symlinkSync(path.join(b.dir, 'secret'), path.join(b.dir, 'upload'));
	assert.deepEqual(b.call('set'), { error: 'logo_missing' });
	assert.deepEqual(b.files(), []);
});
