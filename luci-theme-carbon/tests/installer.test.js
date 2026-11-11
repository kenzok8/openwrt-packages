'use strict';

// carbon-install.sh control flow against a fake root with stub apk/opkg/uci.
// Real package managers are exercised in tests/installer-integration.py (Docker).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const VERSION = fs.readFileSync(path.join(REPO, 'root/usr/share/carbon/version'), 'utf8').trim();
let tmp, installer, plainInstaller;

const STUBS = path.join(__dirname, 'installer-stubs');   // stub apk / opkg / uci

test.before(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'carbon-installer-'));
	const fakeApk = path.join(tmp, 'luci-theme-carbon-9.9.9-r1.apk');
	fs.writeFileSync(fakeApk, 'signed apk stand-in');
	execFileSync('sh', [path.join(REPO, 'scripts/build-installer.sh'), path.join(tmp, 'full'), '--apk', fakeApk], { stdio: 'pipe' });
	execFileSync('sh', [path.join(REPO, 'scripts/build-installer.sh'), path.join(tmp, 'plain')], { stdio: 'pipe' });
	installer = path.join(tmp, 'full', 'carbon-install.sh');
	plainInstaller = path.join(tmp, 'plain', 'carbon-install.sh');
	for (const [name, tools] of Object.entries({ apk: ['apk', 'uci'], opkg: ['opkg', 'uci'], none: ['uci'] })) {
		const dir = path.join(tmp, 'bin-' + name);
		fs.mkdirSync(dir);
		for (const tool of tools) fs.copyFileSync(path.join(STUBS, tool), path.join(dir, tool));
		for (const tool of tools) fs.chmodSync(path.join(dir, tool), 0o755);
	}
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

let n = 0;
function router(manager, { installed = {} } = {}) {
	const dir = path.join(tmp, 'router' + (++n));
	const root = path.join(dir, 'root'), state = path.join(dir, 'state');
	fs.mkdirSync(path.join(root, 'usr/share/ucode/luci/template'), { recursive: true });
	fs.writeFileSync(path.join(root, 'usr/share/ucode/luci/template/header.ut'), '');
	if (manager === 'apk') { fs.mkdirSync(path.join(root, 'etc/apk'), { recursive: true }); fs.writeFileSync(path.join(root, 'etc/apk/world'), ''); }
	fs.mkdirSync(path.join(state, 'pkgs'), { recursive: true });
	fs.writeFileSync(path.join(state, 'log'), '');
	for (const [name, version] of Object.entries(installed)) fs.writeFileSync(path.join(state, 'pkgs', name), version);
	const run = (args = [], env = {}, file = installer) => {
		const r = spawnSync('sh', [file, ...args], {
			encoding: 'utf8',
			env: { PATH: path.join(tmp, 'bin-' + manager) + ':/usr/bin:/bin', CARBON_ROOT: root, STATE: state, ...env }
		});
		return { code: r.status, out: r.stdout + r.stderr };
	};
	return {
		root, run,
		log: () => fs.readFileSync(path.join(state, 'log'), 'utf8'),
		version: (name = 'luci-theme-carbon') => { try { return fs.readFileSync(path.join(state, 'pkgs', name), 'utf8').trim(); } catch (e) { return null; } },
		theme: () => { try { return fs.readFileSync(path.join(state, 'theme'), 'utf8').trim(); } catch (e) { return null; } },
		exists: (p) => fs.existsSync(path.join(root, p))
	};
}

test('apk: installs the embedded signed package through apk with a private key directory', () => {
	const r = router('apk');
	const { code, out } = r.run();
	assert.equal(code, 0, out);
	assert.equal(r.version(), '9.9.9-r1');
	assert.match(r.log(), /apk --keys-dir \S+ --repositories-file \/dev\/null --no-network verify \S+luci-theme-carbon\.apk/);
	assert.match(r.log(), /apk add luci-base curl ca-bundle flock/, 'missing dependencies come from the feeds');
	assert.match(r.log(), /apk --keys-dir \S+ --repositories-file \/dev\/null --no-network add \S+luci-theme-carbon\.apk/);
	assert.equal(r.exists('etc/apk/keys/carbon-apk.pem'), false, 'system trust unchanged');
	assert.equal(r.exists('www/luci-static/carbon'), false, 'no loose files copied');
	assert.equal(r.theme(), '/luci-static/carbon');
	assert.match(out, /installed with apk/);
});

test('apk: --trust-key also adds the embedded key to /etc/apk/keys', () => {
	const r = router('apk');
	assert.equal(r.run(['--trust-key']).code, 0);
	assert.equal(fs.readFileSync(path.join(r.root, 'etc/apk/keys/carbon-apk.pem'), 'utf8'),
		fs.readFileSync(path.join(REPO, 'keys/carbon-apk.pem'), 'utf8'));
});

test('apk: a bad signature aborts without installing or copying anything', () => {
	const r = router('apk');
	const { code, out } = r.run([], { APK_VERIFY_RC: '1' });
	assert.notEqual(code, 0);
	assert.match(out, /signature verification failed/);
	assert.equal(r.version(), null);
	assert.equal(r.exists('www/luci-static/carbon'), false);
	assert.equal(r.theme(), null);
});

test('offline without dependencies: falls back to copying files, with a warning', () => {
	const r = router('apk');
	const { code, out } = r.run([], { DEPS_FAIL: '1' });
	assert.equal(code, 0, out);
	assert.equal(r.version(), null);
	assert.ok(r.exists('www/luci-static/carbon/carbon.css'));
	assert.ok(r.exists('usr/libexec/rpcd/luci.carbon_update'));
	assert.match(out, /online updates stay\s+WARNING: disabled|online updates stay/);
});

test('script-only install migrates to a registered package', () => {
	const r = router('opkg');
	assert.equal(r.run(['--files']).code, 0);
	assert.ok(r.exists('www/luci-static/carbon/carbon.css'));
	assert.equal(r.version(), null);
	const { code, out } = r.run();
	assert.equal(code, 0, out);
	assert.equal(r.version(), VERSION);
	// unowned files were removed so the package owns them (the stub installs no files)
	assert.equal(r.exists('www/luci-static/carbon'), false);
});

test('opkg: installs the embedded ipk; same version reinstalls; newer installed is kept', () => {
	let r = router('opkg', { installed: { 'luci-base': '1', curl: '1', 'ca-bundle': '1', flock: '1' } });
	assert.equal(r.run().code, 0);
	assert.equal(r.version(), VERSION);
	assert.doesNotMatch(r.log(), /opkg update/, 'no feed access when dependencies are present');
	assert.equal(r.run().code, 0);
	assert.match(r.log(), /opkg install --force-reinstall \S+\.ipk/);

	r = router('opkg', { installed: { 'luci-theme-carbon': '9.0.0-r1' } });
	const { code, out } = r.run();
	assert.equal(code, 0);
	assert.match(out, /newer than this installer/);
	assert.equal(r.version(), '9.0.0-r1');
});

test('a failed upgrade of a registered package stops instead of copying files', () => {
	const r = router('apk', { installed: { 'luci-theme-carbon': '1.0.0-r1', 'luci-base': '1', curl: '1', 'ca-bundle': '1', flock: '1' } });
	const { code, out } = r.run([], { APK_ADD_RC: '1' });
	assert.notEqual(code, 0);
	assert.match(out, /remains installed/);
	assert.equal(r.version(), '1.0.0-r1');
	assert.equal(r.exists('www/luci-static/carbon'), false);
});

test('apk system with an installer that has no .apk falls back to files', () => {
	const r = router('apk');
	const { code, out } = r.run([], {}, plainInstaller);
	assert.equal(code, 0, out);
	assert.match(out, /no \.apk package/);
	assert.ok(r.exists('www/luci-static/carbon/carbon.css'));
});

test('no package manager: copies files', () => {
	const r = router('none');
	assert.equal(r.run().code, 0);
	assert.ok(r.exists('www/luci-static/carbon/carbon.css'));
});

test('--files refuses to overwrite a registered package', () => {
	const r = router('opkg', { installed: { 'luci-theme-carbon': '1.0.0-r1' } });
	const { code, out } = r.run(['--files']);
	assert.notEqual(code, 0);
	assert.match(out, /upgrade it without --files/);
});

test('uninstall removes the package, leftover files and settings, and restores a theme', () => {
	const r = router('apk');
	assert.equal(r.run().code, 0);
	fs.mkdirSync(path.join(r.root, 'www/luci-static/bootstrap'), { recursive: true });
	fs.mkdirSync(path.join(r.root, 'etc/config'), { recursive: true });
	fs.writeFileSync(path.join(r.root, 'etc/config/carbon'), '');
	const { code, out } = r.run(['uninstall']);
	assert.equal(code, 0, out);
	assert.match(r.log(), /apk del luci-theme-carbon/);
	assert.equal(r.version(), null);
	assert.equal(r.exists('etc/config/carbon'), false);
	assert.equal(r.theme(), '/luci-static/bootstrap');
});

test('unknown arguments print usage', () => {
	const r = router('none');
	const { code, out } = r.run(['--bogus']);
	assert.equal(code, 1);
	assert.match(out, /Usage:/);
});
