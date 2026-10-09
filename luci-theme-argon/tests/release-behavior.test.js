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
		assert.equal(result.apk_version, tag.replace(/^v/, ''));
		assert.equal(result.ipk_version, result.apk_version);
	}
	for (const stage of ['alpha', 'beta', 'rc']) {
		const result = metadata(`v2.5.0-${stage}.12`);
		assert.equal(result.prerelease, 'true');
		assert.equal(result.version, `2.5.0-${stage}.12`);
		assert.equal(result.apk_version, `2.5.0_${stage}12`);
		assert.equal(result.ipk_version, `2.5.0~${stage}12-1`);
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
	assert.match(prepare.stderr.toString(), /matching tags/);
	const sync = spawnSync('bash', [path.join(scripts, 'update_release_docs.sh'), 'v2.5.0-beta.1'], { cwd: dir, env });
	assert.equal(sync.status, 0, sync.stderr.toString());
	for (const file of files) assert.equal(readFileSync(path.join(dir, file), 'utf8'), 'stable v2.4.8\n');
});

test('config source resolves matching lightweight and annotated tags, and never falls back for previews', t => {
	const dir = mkdtempSync(path.join(tmpdir(), 'argon-preview-config-'));
	t.after(() => rmSync(dir, { recursive: true, force: true }));
	const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	git('init', '-b', 'master');
	git('config', 'user.name', 'Release test');
	git('config', 'user.email', 'release-test@example.invalid');
	git('commit', '--allow-empty', '-m', 'config preview');
	const tagged = git('rev-parse', 'HEAD');
	git('tag', 'v2.5.0-beta.1');
	git('tag', '-a', 'v2.5.0-rc.1', '-m', 'annotated preview');
	git('tag', 'v2.5.0');
	git('commit', '--allow-empty', '-m', 'later master');
	const master = git('rev-parse', 'HEAD');
	const resolve = (tag, remote = dir) => spawnSync('bash', [path.join(scripts, 'resolve_config.sh'), remote, tag], { encoding: 'utf8' });
	for (const tag of ['v2.5.0-beta.1', 'v2.5.0-rc.1', 'v2.5.0']) {
		const result = resolve(tag);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stdout.trim(), `sha=${tagged}`);
	}
	assert.equal(resolve('v2.6.0').stdout.trim(), `sha=${master}`);
	const missing = resolve('v2.5.0-beta.2');
	assert.notEqual(missing.status, 0);
	assert.match(missing.stdout, /matching config tag/);
	assert.doesNotMatch(missing.stdout, /sha=/);
	const unavailable = resolve('v2.6.0', path.join(dir, 'missing.git'));
	assert.notEqual(unavailable.status, 0);
	assert.doesNotMatch(unavailable.stdout, /sha=/);
});
