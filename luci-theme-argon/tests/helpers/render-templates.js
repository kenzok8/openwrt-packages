'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { tmpdir } = require('node:os');
const { execFileSync } = require('node:child_process');

// Execute real nested templates with LuCI's scope inheritance. Only router I/O
// imports are replaced; markup, conditions, escaping and includes stay intact.
module.exports = function createRenderer(sourceDir) {
	const dir = fs.mkdtempSync(path.join(tmpdir(), 'argon-templates-'));
	const target = path.join(dir, 'themes/argon');
	fs.mkdirSync(target, { recursive: true });
	for (const name of fs.readdirSync(sourceDir).filter(name => name.endsWith('.ut'))) {
		const source = fs.readFileSync(path.join(sourceDir, name), 'utf8')
			.replace("import { access, lsdir, lstat } from 'fs';", `
function access(path) { return fixture.configExists ?? true; }
function lsdir(path) { return fixture.icons ?? ['default.svg', 'status.svg']; }
function lstat(path) { return { type: 'file' }; }`)
			.replace("import { access } from 'fs';", 'function access(path) { return fixture.configExists ?? true; }')
			.replace("import * as fs from 'fs';", `
let fs = { access: path => fixture.configExists ?? true,
  lsdir: path => fixture.backgrounds ?? ['photo.jpg'] };`)
			.replace("import { cursor } from 'uci';", 'function cursor() { return { get_first: (p, s, key) => fixture.settings?.[key] }; }')
			.replace("import { getuid, getspnam } from 'luci.core';", "function getuid() { return 0; } function getspnam(name) { return { pwdp: fixture.no_password ? '' : 'x' }; }")
			.replace("import { get_branding } from 'luci.argon-branding';", 'function get_branding() { return fixture.branding ?? {}; }');
		fs.writeFileSync(path.join(target, name), source);
	}
	const script = path.join(dir, 'render.uc');
	fs.writeFileSync(script, `
let scopes = [], contentTypes = [];
function encode(value, attribute) {
  if (type(value) != 'string') return null;
  return replace(replace(replace(replace(value, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
}
function include_template(name, scope) {
  let local_scope = proto(scope ?? {}, scopes[-1]);
  push(scopes, local_scope);
  call(loadfile(${JSON.stringify(dir)} + '/' + name + '.ut', { raw_mode: false }), null, local_scope);
  pop(scopes);
}
const env = proto({
  theme: 'argon', media: '/luci-static/argon', resource: '/luci-static/resources',
  dispatcher: { lang: 'en', build_url: (...parts) => '/cgi-bin/luci/' + join('/', parts), lookup: () => true },
  http: { prepare_content: value => push(contentTypes, value), getenv: name => '/cgi-bin/luci/',
    urlencode: value => replace(replace(replace(value, ' ', '%20'), '#', '%23'), '?', '%3F') },
  ubus: { call: (object, method) => object == 'luci.argon_wallpaper'
    ? fixture.wallpaper : { hostname: fixture.hostname ?? 'Router' } },
  ctx: { path: ['admin', 'status', 'overview'], request_path: ['admin', 'status', 'overview'], authsession: 'session' },
  version: { luciname: 'LuCI', luciversion: 'test-build', distname: 'OpenWrt', distversion: '25.12.5', distrevision: 'test', disturl: 'https://openwrt.org/' },
  _: value => value, entityencode: encode, striptags: value => replace(value, /<[^>]*>/g, ''),
  node: fixture.node ?? {}, css: fixture.css, duser: fixture.duser ?? 'root',
  fuser: fixture.fuser, auth_plugin: fixture.auth_plugin, auth_message: fixture.auth_message,
  auth_fields: fixture.auth_fields, auth_html: fixture.auth_html, auth_assets: fixture.auth_assets,
  include: include_template
}, global);
push(scopes, env);
const html = render(() => {
  if (entry == 'application') {
    include_template('themes/argon/header');
    print('<div id="view">Fixture</div>');
    include_template('themes/argon/footer');
  }
  else if (entry == 'headers-twice') {
    include_template('themes/argon/out_header_login');
    include_template('themes/argon/out_header_login');
  }
  else {
    include_template('themes/argon/' + entry);
  }
});
print(sprintf('%J', { html, contentTypes }));
`);
	return {
		render(entry, fixture = {}) {
			return JSON.parse(execFileSync(process.env.UCODE_BIN || 'ucode', [
				'-L', path.join(path.dirname(process.env.UCODE_BIN || 'ucode'), '*.so'),
				'-L', path.resolve(__dirname, '../../root/usr/share/ucode/*.uc'),
				'-Dentry=' + JSON.stringify(entry), '-Dfixture=' + JSON.stringify(fixture), script
			], { encoding: 'utf8' }));
		},
		close() { fs.rmSync(dir, { recursive: true, force: true }); }
	};
};
