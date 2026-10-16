'use strict';

const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('node:child_process');
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const scripts = path.resolve(__dirname, '../.github/scripts');

function metadata(tag) {
	const output = execFileSync('python3', [path.join(scripts, 'release_metadata.py'), tag], { encoding: 'utf8' });
	return Object.fromEntries(output.trim().split('\n').map(line => line.split('=')));
}

test('stable versions retain their package versions and preview suffixes use native package formats', () => {
	for (const tag of ['v2.4.8', '2.5.0']) {
		const result = metadata(tag);
		assert.equal(result.tag, tag);
		assert.equal(result.prerelease, 'false');
		assert.equal(result.package_release, '1');
		assert.equal(result.apk_version, tag.replace(/^v/, ''));
		assert.equal(result.ipk_version, result.apk_version);
	}
	for (const stage of ['alpha', 'beta', 'rc']) {
		const result = metadata(`v2.5.0-${stage}.12`);
		assert.equal(result.prerelease, 'true');
		assert.equal(result.package_release, '1');
		assert.equal(result.version, `2.5.0-${stage}.12`);
		assert.equal(result.apk_version, `2.5.0_${stage}12`);
		assert.equal(result.ipk_version, `2.5.0~${stage}12-1`);
	}
});

test('rebuilt packages upgrade the original revision in both package formats', () => {
	for (const tag of ['v2.5.0-beta.1', '2.5.0-beta.1']) {
		const result = metadata(tag);
		assert.equal(result.prerelease, 'true');
		assert.equal(result.package_release, '2');
		assert.equal(result.apk_version, '2.5.0_beta1');
		assert.equal(result.ipk_version, '2.5.0~beta1-2');
	}
	assert.equal(metadata('v2.5.0-beta.2').package_release, '1');
	assert.equal(metadata('v2.5.0-beta.2').ipk_version, '2.5.0~beta2-1');
	for (const tag of ['v3.0.0', '3.0.0']) {
		const result = metadata(tag);
		assert.equal(result.prerelease, 'false');
		assert.equal(result.package_release, '2');
		assert.equal(result.apk_version, '3.0.0');
		assert.equal(result.ipk_version, '3.0.0-2');
		assert.equal(result.apk_i18n_version, '3.0.0-r2');
		assert.equal(result.ipk_i18n_version, 'v3.0.0-2');
	}
	assert.equal(metadata('v3.0.1').package_release, '1');
});

test('translation versions follow the recipe without Git history and retain IPK migration ordering', t => {
	const dir = mkdtempSync(path.join(tmpdir(), 'argon-translation-versions-'));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	require('node:fs').mkdirSync(path.join(dir, 'feeds/luci'), { recursive: true });
	writeFileSync(path.join(dir, 'rules.mk'), '');
	writeFileSync(path.join(dir, 'feeds/luci/luci.mk'), 'print-version:\n\t@printf "%s\\n" "$(PKG_PO_VERSION)"\n');
	const recipe = path.resolve(__dirname, '../Makefile');
	for (const tag of ['v3.0.0', 'v3.0.1', 'v3.0.2', 'v3.1.0-beta.1', 'v2.5.0-beta.1']) {
		const result = metadata(tag);
		for (const format of ['ipk', 'apk']) {
			const actual = execFileSync('make', ['--no-print-directory', '-s', '-f', recipe, 'print-version',
				`TOPDIR=${dir}`, `CONFIG_USE_APK=${format === 'apk' ? 'y' : ''}`,
				`PKG_VERSION=${result[`${format}_version`]}`, `PKG_RELEASE=${result.package_release}`
			], { cwd: dir, encoding: 'utf8' }).trim();
			assert.equal(actual, result[`${format}_i18n_version`], `${tag}/${format}`);
		}
		assert.equal(result.ipk_i18n_version, `v${result.ipk_version}`);
		assert.equal(result.apk_i18n_version, `${result.apk_version}-r${result.package_release}`);
	}
});

test('invalid and unsupported tags fail before producing release outputs', () => {
	for (const tag of ['latest', 'v2.5.0-beta', 'v2.5.0-beta.0', 'v2.5.0-preview.1', 'v2.5.0+build', 'v2.5.0\nprerelease=false']) {
		const result = spawnSync('python3', [path.join(scripts, 'release_metadata.py'), tag], { encoding: 'utf8' });
		assert.notEqual(result.status, 0, tag);
		assert.equal(result.stdout, '', tag);
	}
});

test('preview preparation and documentation sync cannot overwrite stable metadata', t => {
	const dir = mkdtempSync(path.join(tmpdir(), 'argon-preview-docs-'));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const files = ['Makefile', 'README.md', 'README_ZH.md', 'RELEASE.md', 'RELEASE_ZH.md'];
	for (const file of files) writeFileSync(path.join(dir, file), 'stable v2.4.8\n');
	const env = { ...process.env, GITHUB_REPOSITORY: '', GITHUB_TOKEN: '' };
	const prepare = spawnSync('bash', [path.join(scripts, 'prepare_release_commit.sh'), 'v2.5.0-beta.1'], { cwd: dir, env });
	assert.equal(prepare.status, 1);
	assert.match(prepare.stderr.toString(), /tag the theme repository directly/);
	const sync = spawnSync('bash', [path.join(scripts, 'update_release_docs.sh'), 'v2.5.0-beta.1'], { cwd: dir, env });
	assert.equal(sync.status, 0, sync.stderr.toString());
	for (const file of files) assert.equal(readFileSync(path.join(dir, file), 'utf8'), 'stable v2.4.8\n');
});



test('stable release preparation updates the theme and compatibility recipe together', t => {
 const dir = mkdtempSync(path.join(tmpdir(), 'argon-integrated-release-'));
 t.after(() => rmSync(dir, { recursive: true, force: true }));
 require('node:fs').mkdirSync(path.join(dir, 'compat/luci-app-argon-config'), { recursive: true });
 for (const file of ['Makefile', 'compat/luci-app-argon-config/Makefile'])
  writeFileSync(path.join(dir, file), 'PKG_VERSION:=3.0.0\nPKG_RELEASE:=1\n');
 for (const file of ['README.md', 'README_ZH.md', 'RELEASE.md', 'RELEASE_ZH.md'])
  writeFileSync(path.join(dir, file), '# Release fixture\n');
 const result = spawnSync('bash', [path.join(scripts, 'prepare_release_commit.sh'), 'v3.0.1'], {
  cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: 'example/argon', PKG_RELEASE_DATE: '20261015' }
 });
 assert.equal(result.status, 0, result.stderr);
 for (const file of ['Makefile', 'compat/luci-app-argon-config/Makefile']) {
  assert.match(readFileSync(path.join(dir, file), 'utf8'), /PKG_VERSION:=3\.0\.1/);
  assert.match(readFileSync(path.join(dir, file), 'utf8'), /PKG_RELEASE:=20261015/);
 }
});
