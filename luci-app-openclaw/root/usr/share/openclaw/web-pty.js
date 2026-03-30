#!/usr/bin/env node
// ============================================================================
// OpenClaw 配置工具 — Web PTY 服务器
// 纯 Node.js 实现，零外部依赖
// 通过 WebSocket 将 oc-config.sh 的 TTY 输出推送给浏览器 xterm.js
// HTTP 端口 18793, HTTPS 可选端口 18794
// ============================================================================

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── 配置 (OpenWrt 适配) ──
const PORT = parseInt(process.env.OC_CONFIG_PORT || '18793', 10);
const HOST = process.env.OC_CONFIG_HOST || '0.0.0.0'; // token 认证保护，可安全绑定所有接口
const NODE_BASE = process.env.NODE_BASE || '/opt/openclaw/node';
const OC_GLOBAL = process.env.OC_GLOBAL || '/opt/openclaw/global';
const OC_DATA = process.env.OC_DATA || '/opt/openclaw/data';
const SCRIPT_PATH = process.env.OC_CONFIG_SCRIPT || '/usr/share/openclaw/oc-config.sh';
const SSL_CERT = '/etc/uhttpd.crt';
const SSL_KEY = '/etc/uhttpd.key';
const MAX_SESSIONS = parseInt(process.env.OC_MAX_SESSIONS || '5', 10);

// ── 认证令牌 (从 UCI 或环境变量读取) ──
function loadAuthToken() {
  try {
    const { execSync } = require('child_process');
    const t = execSync('uci -q get openclaw.main.pty_token 2>/dev/null', { encoding: 'utf8', timeout: 3000 }).trim();
    return t || '';
  } catch { return ''; }
}
let AUTH_TOKEN = process.env.OC_PTY_TOKEN || loadAuthToken();

// ── 会话计数 ──
let activeSessions = 0;

// ── 静态文件 ──
const UI_DIR = path.join(__dirname, 'ui');

function getMimeType(ext) {
  const types = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css',
    '.js': 'application/javascript', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
  };
  return types[ext] || 'application/octet-stream';
}

const IFRAME_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'X-Frame-Options': 'ALLOWALL',
  'Content-Security-Policy': "default-src * 'unsafe-inline' 'unsafe-eval' data: blob: ws: wss:; frame-ancestors *",
};

// ── WebSocket 帧处理 (RFC 6455) ──
function decodeWSFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = !!(buf[1] & 0x80);
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;
  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2); offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2)); offset = 10;
  }
  let mask = null;
  if (masked) {
    if (buf.length < offset + 4) return null;
    mask = buf.slice(offset, offset + 4); offset += 4;
  }
  if (buf.length < offset + payloadLen) return null;
  const data = buf.slice(offset, offset + payloadLen);
  if (mask) { for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3]; }
  return { opcode, data, totalLen: offset + payloadLen };
}

function encodeWSFrame(data, opcode = 0x01) {
  const payload = typeof data === 'string' ? Buffer.from(data) : data;
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2); header[0] = 0x80 | opcode; header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

// ── PTY 进程管理 ──
class PtySession {
  constructor(socket) {
    this.socket = socket;
    this.proc = null;
    this.cols = 80;
    this.rows = 24;
    this.buffer = Buffer.alloc(0);
    this.alive = true;
    this._spawnFailCount = 0;
    this._MAX_SPAWN_RETRIES = 5;
    this._pingTimer = null;
    this._pongReceived = true;
    activeSessions++;
    console.log(`[oc-config] Session created (active: ${activeSessions}/${MAX_SESSIONS})`);
    this._setupWSReader();
    this._startPing();
    this._spawnPty();
  }

  // WebSocket ping/pong 保活 (每 25 秒发一次 ping)
  _startPing() {
    this._pingTimer = setInterval(() => {
      if (!this.alive) { clearInterval(this._pingTimer); return; }
      if (!this._pongReceived) {
        console.log('[oc-config] Pong timeout, closing connection');
        this._cleanup();
        return;
      }
      this._pongReceived = false;
      try { this.socket.write(encodeWSFrame(Buffer.alloc(0), 0x09)); } catch(e) { this._cleanup(); }
    }, 25000);
  }

  _setupWSReader() {
    this.socket.on('data', (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      while (this.buffer.length > 0) {
        const frame = decodeWSFrame(this.buffer);
        if (!frame) break;
        this.buffer = this.buffer.slice(frame.totalLen);
        if (frame.opcode === 0x01) this._handleMessage(frame.data.toString());
        else if (frame.opcode === 0x02 && this.proc && this.proc.stdin.writable) this.proc.stdin.write(frame.data);
        else if (frame.opcode === 0x08) { console.log('[oc-config] WS close frame received'); this._cleanup(); }
        else if (frame.opcode === 0x09) this.socket.write(encodeWSFrame(frame.data, 0x0a));
        else if (frame.opcode === 0x0a) { this._pongReceived = true; }
      }
    });
    this.socket.on('close', (hadError) => { console.log(`[oc-config] Socket closed, hadError=${hadError}`); this._cleanup(); });
    this.socket.on('error', (err) => { console.log(`[oc-config] Socket error: ${err.message}`); this._cleanup(); });
  }

  _handleMessage(text) {
    try {
      const msg = JSON.parse(text);
      if (msg.type === 'stdin' && this.proc && this.proc.stdin.writable) {
        // 去除 bracketed paste 转义序列，避免污染 shell read 输入
        const cleaned = msg.data.replace(/\x1b\[\?2004[hl]/g, '').replace(/\x1b\[20[01]~/g, '');
        this.proc.stdin.write(cleaned);
      }
      else if (msg.type === 'resize') {
        this.cols = msg.cols || 80; this.rows = msg.rows || 24;
        if (this.proc && this.proc.pid) {
          try { process.kill(-this.proc.pid, 'SIGWINCH'); } catch(e){}
        }
      }
      else if (msg.type === 'ping') {
        // 应用层心跳: 客户端定期发送 ping，服务端回复 pong 保持连接活跃
        this.socket.write(encodeWSFrame(JSON.stringify({ type: 'pong' }), 0x01));
      }
    } catch(e) { if (this.proc && this.proc.stdin.writable) this.proc.stdin.write(text); }
  }

  _spawnPty() {
    const env = {
      ...process.env, TERM: 'xterm-256color', COLUMNS: String(this.cols), LINES: String(this.rows),
      COLORTERM: 'truecolor', LANG: 'en_US.UTF-8',
      NODE_BASE, OC_GLOBAL, OC_DATA,
      HOME: OC_DATA,
      OPENCLAW_HOME: OC_DATA,
      OPENCLAW_STATE_DIR: `${OC_DATA}/.openclaw`,
      OPENCLAW_CONFIG_PATH: `${OC_DATA}/.openclaw/openclaw.json`,
      PATH: `${NODE_BASE}/bin:${OC_GLOBAL}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
    };
    // 检测 script 命令是否可用 (OpenWrt 默认不包含 util-linux-script)
    // 如不可用则回退到直接用 sh 执行，牺牲 PTY 但保证功能可用
    const hasScript = (() => {
      try {
        const { execFileSync } = require('child_process');
        execFileSync('which', ['script'], { stdio: 'pipe', timeout: 2000 });
        return true;
      } catch { return false; }
    })();
    if (hasScript) {
      this.proc = spawn('script', ['-qc', `stty rows ${this.rows} cols ${this.cols} 2>/dev/null; printf '\\e[?2004l'; sh "${SCRIPT_PATH}"`, '/dev/null'],
        { stdio: ['pipe', 'pipe', 'pipe'], env, detached: true });
      this._usePty = true;
    } else {
      console.log('[oc-config] "script" command not found, falling back to sh (install util-linux-script for full PTY support)');
      this.proc = spawn('sh', [SCRIPT_PATH],
        { stdio: ['pipe', 'pipe', 'pipe'], env, detached: true });
      this._usePty = false;
    }

    // sh 模式无 PTY，shell 只输出 \n，终端需要 \r\n，否则每行从上一行末尾开始（斜向偏移）
    const _emit = (d) => {
      if (!this.alive) return;
      this._spawnFailCount = 0;
      const out = this._usePty ? d : Buffer.from(d.toString('binary').replace(/\r?\n/g, '\r\n'), 'binary');
      this.socket.write(encodeWSFrame(out, 0x01));
    };
    this.proc.stdout.on('data', _emit);
    this.proc.stderr.on('data', _emit);
    this.proc.on('close', (code) => {
      if (!this.alive) return;
      // PTY 以 root 运行，子脚本可能创建了 root-owned 的目录
      // 修复权限，防止以 openclaw 用户运行的 Gateway 遇到 EACCES
      try { require('child_process').execFileSync('chown', ['-R', 'openclaw:openclaw', OC_DATA], { stdio: 'pipe', timeout: 5000 }); } catch(e) {}
      this._spawnFailCount++;
      if (this._spawnFailCount > this._MAX_SPAWN_RETRIES) {
        console.log(`[oc-config] Script failed ${this._spawnFailCount} times, stopping retries`);
        this.socket.write(encodeWSFrame(`\r\n\x1b[31m配置脚本连续启动失败 ${this._spawnFailCount} 次，已停止重试。\r\n请检查是否已安装 util-linux-script 包: opkg install coreutils-script\x1b[0m\r\n`, 0x01));
        this.proc = null;
        return;
      }
      console.log(`[oc-config] Script exited with code ${code}, auto-restarting (attempt ${this._spawnFailCount}/${this._MAX_SPAWN_RETRIES})...`);
      this.socket.write(encodeWSFrame(`\r\n\x1b[33m配置脚本已退出 (code: ${code})，正在自动重启...\x1b[0m\r\n`, 0x01));
      this.proc = null;
      // 自动重启脚本，保持 WebSocket 连接
      setTimeout(() => {
        if (this.alive) {
          this._spawnPty();
        }
      }, 1500);
    });
    this.proc.on('error', (err) => {
      this._spawnFailCount++;
      if (this.alive) this.socket.write(encodeWSFrame(`\r\n\x1b[31m启动失败: ${err.message}\x1b[0m\r\n`, 0x01));
    });
  }

  _cleanup() {
    if (!this.alive) return; this.alive = false;
    if (this._pingTimer) { clearInterval(this._pingTimer); this._pingTimer = null; }
    activeSessions = Math.max(0, activeSessions - 1);
    console.log(`[oc-config] Session ended (active: ${activeSessions}/${MAX_SESSIONS})`);
    if (this.proc) { try { process.kill(-this.proc.pid, 'SIGTERM'); } catch(e){} try { this.proc.kill('SIGTERM'); } catch(e){} }
    try { this.socket.destroy(); } catch(e){}
  }
}

// ── HTTP 请求处理 ──
function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let fp = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': '*' });
    return res.end();
  }
  if (fp === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    return res.end(JSON.stringify({ status: 'ok', port: PORT, uptime: process.uptime() }));
  }
  if (fp === '/' || fp === '') fp = '/index.html';

  const fullPath = path.join(UI_DIR, fp);
  if (!fullPath.startsWith(UI_DIR)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      if (fp !== '/index.html') {
        fs.readFile(path.join(UI_DIR, 'index.html'), (e2, d2) => {
          if (e2) { res.writeHead(404); res.end('Not Found'); }
          else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...IFRAME_HEADERS }); res.end(d2); }
        });
      } else { res.writeHead(404); res.end('Not Found'); }
      return;
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': getMimeType(ext), 'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=3600', ...IFRAME_HEADERS });
    res.end(data);
  });
}

// ── WebSocket Upgrade ──
function handleUpgrade(req, socket, head) {
  console.log(`[oc-config] WS upgrade: ${req.url} remote=${socket.remoteAddress}:${socket.remotePort}`);
  if (req.url !== '/ws' && !req.url.startsWith('/ws?')) { socket.destroy(); return; }

  // 认证: 验证查询参数中的 token
  // 每次连接时实时读取 UCI token (安装/升级可能重新生成 token)
  const currentToken = loadAuthToken() || AUTH_TOKEN;
  if (currentToken) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const clientToken = url.searchParams.get('token') || '';
    if (clientToken !== currentToken) {
      console.log(`[oc-config] WS auth failed from ${socket.remoteAddress}`);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
  }

  // 并发会话限制
  if (activeSessions >= MAX_SESSIONS) {
    console.log(`[oc-config] Max sessions reached (${activeSessions}/${MAX_SESSIONS}), rejecting`);
    socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) { console.log('[oc-config] Missing Sec-WebSocket-Key'); socket.destroy(); return; }

  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');

  socket.setNoDelay(true);
  socket.setTimeout(0);

  const handshake = 'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n';

  socket.write(handshake, () => {
    if (head && head.length > 0) socket.unshift(head);
    new PtySession(socket);
    console.log('[oc-config] PTY session started');
  });
}

// ── 服务器实例 ──
const httpServer = http.createServer(handleRequest);
httpServer.on('upgrade', handleUpgrade);
let httpsServer = null;

httpServer.listen(PORT, HOST, () => {
  console.log(`[oc-config] HTTP listening on ${HOST}:${PORT}`);
  console.log(`[oc-config] Script: ${SCRIPT_PATH}`);
});

// HTTPS 可选端口 PORT+1
const HTTPS_PORT = PORT + 1;
try {
  if (fs.existsSync(SSL_CERT) && fs.existsSync(SSL_KEY)) {
    httpsServer = https.createServer({ cert: fs.readFileSync(SSL_CERT), key: fs.readFileSync(SSL_KEY) }, handleRequest);
    httpsServer.on('upgrade', handleUpgrade);
    httpsServer.listen(HTTPS_PORT, HOST, () => console.log(`[oc-config] HTTPS listening on ${HOST}:${HTTPS_PORT}`));
    httpsServer.on('error', (e) => console.log(`[oc-config] HTTPS port ${HTTPS_PORT}: ${e.message}`));
  }
} catch (e) { console.log(`[oc-config] SSL init: ${e.message}`); }

httpServer.on('error', (e) => { console.error(`[oc-config] Fatal: ${e.message}`); process.exit(1); });
function shutdown() { console.log('[oc-config] Shutdown'); httpServer.close(); if (httpsServer) httpsServer.close(); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
