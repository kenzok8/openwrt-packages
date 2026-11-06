// web-pty.js 认证回归：服务端有 token 时，无/错 token 必须 403、对 token 必须 101；
// 服务端 token 为空时必须一律 403（fail-closed）。
// 用法: node tests/test-pty-auth.mjs
import net from 'net';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(HERE, '..', 'root', 'usr', 'share', 'openclaw', 'web-pty.js');
const PORT = 18799;

const WITH_TOKEN = [
	{ name: '无 token 参数', query: '', expect: 403 },
	{ name: '错 token', query: 'token=wrong', expect: 403 },
	{ name: '对 token', query: 'token=secret123', expect: 101 }
];
const WITHOUT_TOKEN = [
	{ name: '无 token 参数', query: '', expect: 403 },
	{ name: '错 token', query: 'token=wrong', expect: 403 },
	{ name: '任意 token', query: 'token=secret123', expect: 403 }
];

function handshake(query) {
	return new Promise((resolve) => {
		const sock = net.connect(PORT, '127.0.0.1', () => {
			sock.write(
				'GET /ws' + (query ? '?' + query : '') + ' HTTP/1.1\r\n' +
				'Host: 127.0.0.1:' + PORT + '\r\n' +
				'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
				'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
				'Sec-WebSocket-Version: 13\r\n\r\n'
			);
		});
		let buf = '';
		const done = (code) => { try { sock.destroy(); } catch (e) {} resolve(code); };
		sock.on('data', (d) => {
			buf += d.toString();
			const m = buf.match(/^HTTP\/1\.1 (\d{3})/);
			if (m) done(parseInt(m[1], 10));
		});
		sock.on('error', () => done(0));
		setTimeout(() => done(0), 3000);
	});
}

function startServer(token) {
	const env = { ...process.env, OC_CONFIG_PORT: String(PORT), OC_CONFIG_HOST: '127.0.0.1', OC_CONFIG_SCRIPT: '/bin/true' };
	if (token === null) delete env.OC_PTY_TOKEN; else env.OC_PTY_TOKEN = token;
	const proc = spawn(process.execPath, [TARGET], { env, stdio: ['ignore', 'pipe', 'pipe'] });
	return new Promise((resolve) => {
		proc.stdout.on('data', (d) => { if (d.toString().includes('HTTP listening')) resolve(proc); });
		setTimeout(() => resolve(proc), 2500);
	});
}

let failed = 0;
async function run(token, cases, label) {
	const srv = await startServer(token);
	for (const c of cases) {
		const got = await handshake(c.query);
		const ok = got === c.expect;
		if (!ok) failed++;
		console.log(`${ok ? 'PASS' : 'FAIL'}  [${label}] ${c.name}: 期望 ${c.expect}, 实际 ${got}`);
	}
	srv.kill();
	await new Promise((r) => setTimeout(r, 400));
}

await run('secret123', WITH_TOKEN, '已配置 token');
await run(null, WITHOUT_TOKEN, '服务端无 token');
console.log(failed === 0 ? 'ALL PASS' : `${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
