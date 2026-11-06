'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

function fixture(t, budget = '6') {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'argon-wallpaper-'));
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const bin = path.join(dir, 'bin');
	fs.mkdirSync(bin);
	const cache = path.join(dir, 'wallpaper.url');
	const requests = path.join(dir, 'requests');
	const ssl = path.join(bin, 'wget-ssl');
	const downloader = `#!/bin/sh
printf '%s\\n' "$0 $*" >> "$REQUESTS"
[ "$FETCH_MODE" != failure ] || exit 1
[ "$FETCH_MODE" != hang ] || sleep 20
printf '%s' "$FETCH_PAYLOAD"
`;
	for (const name of ['wget-ssl', 'uclient-fetch'])
		fs.writeFileSync(path.join(bin, name), downloader, { mode: 0o755 });
	fs.writeFileSync(path.join(bin, 'wget'), '#!/bin/sh\necho "HTTPS support not compiled in" >&2\nexit 1\n', { mode: 0o755 });
	fs.writeFileSync(path.join(bin, 'jsonfilter'), `#!/usr/bin/env python3
import json,re,sys
try:
    value=json.load(sys.stdin)
    for key in re.findall(r'[a-zA-Z_]+|[0-9]+',sys.argv[-1]):
        value=value[int(key)] if isinstance(value,list) else value[key]
    print(value)
except (ValueError,KeyError,IndexError,TypeError):
    sys.exit(1)
`, { mode: 0o755 });
	const stub = `
uci() {
  case "$*" in
    *online_wallpaper) printf '%s\\n' "$WALLPAPER_SOURCE" ;;
    *use_api_key) printf '%s\\n' fixture-key ;;
    *use_exact_resolution) printf '1\\n' ;;
  esac
}
json_init() { json_url=''; }
json_add_string() { json_url="$2"; }
json_dump() { printf '{"url":"%s"}\\n' "$json_url"; }
json_cleanup() { :; }
`;
	const script = path.join(dir, 'rpc.sh');
	const source = fs.readFileSync(path.join(__dirname, '../root/usr/libexec/rpcd/luci.argon_wallpaper'), 'utf8')
		.replace('. /lib/functions.sh\n. /usr/share/libubox/jshn.sh', stub)
		.replace('CACHE="/var/run/argon_${WEB_PIC_SRC}.url"', `CACHE="${cache}"`)
		.replace('WRLOCK="/var/lock/argon_${WEB_PIC_SRC}.lock"', `WRLOCK="${dir}/lock"`)
		.replace('WGET=/usr/libexec/wget-ssl', `WGET="${ssl}"`)
		.replace('timeout -k 1 6', `timeout -k 1 ${budget}`);
	fs.writeFileSync(script, source);
	return {
		cache, ssl,
		requests: () => fs.existsSync(requests) ? fs.readFileSync(requests, 'utf8').trim().split('\n') : [],
		call(source = 'bing', body = { images: [{ url: '/th?id=Fixture_1920x1080.jpg' }] }, mode = '') {
			return JSON.parse(execFileSync('sh', ['-c', 'ulimit -n 64; exec sh "$@"', 'sh', script, 'call', 'get_url'], {
				input: '{}\n', encoding: 'utf8', timeout: 3000,
				env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH,
					REQUESTS: requests, WALLPAPER_SOURCE: source, FETCH_PAYLOAD: JSON.stringify(body), FETCH_MODE: mode }
			}));
		}
	};
}

test('cold wallpaper requests use TLS despite a non-SSL wget, then reuse the cache', t => {
	for (const [source, body, expected] of [
		['bing', { images: [{ url: '/th?id=Fixture_1920x1080.jpg' }] }, 'https://www.bing.com/th?id=Fixture_UHD.jpg'],
		['unsplash', { urls: { regular: 'https://images.unsplash.com/fixture.jpg' } }, 'https://images.unsplash.com/fixture.jpg'],
		['wallhaven', { data: [{ path: 'https://w.wallhaven.cc/full/fixture.jpg' }] }, 'https://w.wallhaven.cc/full/fixture.jpg']
	]) {
		const f = fixture(t);
		assert.deepEqual(f.call(source, body), { url: expected });
		assert.equal(fs.readFileSync(f.cache, 'utf8'), expected + '\n');
		const first = f.requests();
		assert.ok(first.length > 0 && first.every(line => line.startsWith(f.ssl + ' ')));
		assert.deepEqual(f.call(source, body, 'failure'), { url: expected });
		assert.deepEqual(f.requests(), first);
	}
});

test('source deployments use uclient-fetch when the standalone TLS binary is absent', t => {
	const f = fixture(t);
	fs.unlinkSync(f.ssl);
	assert.equal(f.call().url, 'https://www.bing.com/th?id=Fixture_UHD.jpg');
	assert.ok(f.requests().every(line => line.includes('/uclient-fetch ')));
});

test('failed wallpaper fetches return a local fallback and retry after the cooldown', t => {
	const f = fixture(t);
	assert.deepEqual(f.call('bing', {}, 'failure'), { url: '' });
	assert.equal(fs.readFileSync(f.cache, 'utf8'), '');
	assert.equal(f.requests().length, 1);
	assert.deepEqual(f.call(), { url: '' });
	assert.equal(f.requests().length, 1);
	const expired = new Date(Date.now() - 122000);
	fs.utimesSync(f.cache, expired, expired);
	assert.equal(f.call().url, 'https://www.bing.com/th?id=Fixture_UHD.jpg');
	assert.equal(f.requests().length, 2);
});

test('a stalled downloader cannot hold the login wallpaper RPC indefinitely', t => {
	const f = fixture(t, '0.2');
	const start = Date.now();
	assert.deepEqual(f.call('bing', {}, 'hang'), { url: '' });
	assert.ok(Date.now() - start < 2000);
	assert.equal(fs.readFileSync(f.cache, 'utf8'), '');
});
