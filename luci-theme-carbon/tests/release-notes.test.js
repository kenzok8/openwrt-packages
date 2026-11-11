'use strict';
/* Release body assembly (scripts/release-notes.sh): bilingual files, each language read through once. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const RELEASES = path.join(ROOT, 'docs/releases');

function notes(tag, files, repo) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'carbon-notes-'));
	fs.copyFileSync(path.join(RELEASES, 'install.md'), path.join(dir, 'install.md'));
	for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
	const args = [path.join(ROOT, 'scripts/release-notes.sh'), tag].concat(repo ? [repo] : []);
	return spawnSync('sh', args, { encoding: 'utf8', env: Object.assign({}, process.env, { RELEASE_NOTES_DIR: dir }) });
}
const headings = (md) => md.split('\n').filter((l) => /^(##+ |---$)/.test(l));

test('a bilingual release reads English start to finish, then Simplified Chinese', () => {
	const r = notes('v9.9.9', { 'v9.9.9.md': fs.readFileSync(path.join(RELEASES, 'v1.1.4.md'), 'utf8') }, 'someone/fork');
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual(headings(r.stdout), [
		'## English', "### What's new", '### Upgrade notes', '### Install', '---',
		'## 简体中文', '### 更新内容', '### 升级须知', '### 安装'
	]);
	const [en, zh] = r.stdout.split('\n---\n');
	assert.doesNotMatch(en, /[一-鿿]/, 'no Chinese in the English section');
	assert.match(zh, /[一-鿿]/);
	assert.match(r.stdout, /github\.com\/someone\/fork\/releases\/latest\/download\/carbon-install\.sh/);
	assert.doesNotMatch(r.stdout, /@REPOSITORY@/);
});

test('a release file must have both language sections', () => {
	const r = notes('v9.9.9', { 'v9.9.9.md': '## English\n\n### What\'s new\n\n- Only English\n' });
	assert.notEqual(r.status, 0);
	assert.match(r.stderr, /missing section ## 简体中文/);
});

test('older single-language notes are kept above both sections', () => {
	const r = notes('v1.0.9', { 'v1.0.9.md': '### v1.0.9\n\n- 旧格式\n' });
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /^### v1\.0\.9\n\n- 旧格式\n\n---\n\n## English\n\n### Install/);
	assert.match(r.stdout, /\n---\n\n## 简体中文\n\n### 安装/);
});

test('tag and repository are validated', () => {
	assert.notEqual(notes('latest', {}).status, 0);
	assert.notEqual(notes('v1.2.3', {}, 'bad repo').status, 0);
});
