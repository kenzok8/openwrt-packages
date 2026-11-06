#!/usr/bin/env node
// OpenClaw 配置读写：脚本侧只调子命令，不再把 JS 塞进 shell 字符串。
// 通用：get <path> | set <path> <string> | dump | check
// 领域命令知道 OpenClaw 的配置结构，见 HANDLERS 末尾。
// 文件由 --file 指定，缺省取 OC_JSON_CONFIG / OPENCLAW_CONFIG_PATH。
import fs from 'fs';
import path from 'path';

const DEFAULT_FILE = process.env.OC_JSON_CONFIG || process.env.OPENCLAW_CONFIG_PATH || '';

function die(msg) {
	process.stderr.write(msg + '\n');
	process.exit(1);
}

function readConfig(file) {
	try {
		const data = JSON.parse(fs.readFileSync(file, 'utf8'));
		return data && typeof data === 'object' ? data : {};
	} catch (e) {
		return {};
	}
}

function writeConfig(file, data) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	const tmp = file + '.tmp';
	fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
	fs.renameSync(tmp, file);
}

const splitPath = (dotted) => String(dotted).split('.').filter((s) => s.length > 0);

function getPath(root, keys) {
	let cur = root;
	for (const k of keys) {
		if (cur === null || typeof cur !== 'object' || !(k in cur)) return undefined;
		cur = cur[k];
	}
	return cur;
}

function ensurePath(root, keys) {
	let cur = root;
	for (const k of keys) {
		if (cur[k] === null || typeof cur[k] !== 'object') cur[k] = {};
		cur = cur[k];
	}
	return cur;
}

function buildModel(id, name, reasoning, input, contextWindow, maxTokens) {
	return {
		id,
		name,
		reasoning,
		input,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: parseInt(contextWindow, 10) || 128000,
		maxTokens: parseInt(maxTokens, 10) || 32000
	};
}

function writeProvider(file, name, baseUrl, apiKey, rows, alsoRegister) {
	const data = readConfig(file);
	data.models = data.models || {};
	data.models.providers = data.models.providers || {};
	data.models.mode = 'merge';
	data.models.providers[name] = {
		baseUrl,
		apiKey,
		api: 'openai-completions',
		models: rows.map(([id, display, reasoning, input, ctx, maxTok]) => buildModel(id, display, reasoning, input, ctx, maxTok))
	};
	if (alsoRegister) {
		data.agents = data.agents || {};
		data.agents.defaults = data.agents.defaults || {};
		data.agents.defaults.models = data.agents.defaults.models || {};
		for (const [id] of rows) data.agents.defaults.models[name + '/' + id] = {};
	}
	writeConfig(file, data);
}

const HANDLERS = {
	get({ file, args }) {
		const value = getPath(readConfig(file), splitPath(args[0]));
		if (value === undefined) return;
		process.stdout.write(typeof value === 'object' ? JSON.stringify(value) : String(value));
	},

	set({ file, args }) {
		const keys = splitPath(args[0]);
		if (!keys.length) die('缺少路径');
		const data = readConfig(file);
		ensurePath(data, keys.slice(0, -1))[keys[keys.length - 1]] = args[1] ?? '';
		writeConfig(file, data);
	},

	dump({ file }) {
		process.stdout.write(JSON.stringify(readConfig(file), null, 2));
	},

	check({ file }) {
		try {
			JSON.parse(fs.readFileSync(file, 'utf8'));
		} catch (e) {
			die(`配置不是合法 JSON: ${e.message}`);
		}
	},

	// 面板支持的认证插件保持开启
	'auth-plugins'({ file }) {
		const data = readConfig(file);
		data.plugins = data.plugins || {};
		data.plugins.entries = data.plugins.entries || {};
		for (const name of ['qwen-portal-auth', 'copilot-proxy', 'google-gemini-cli-auth', 'minimax-portal-auth']) {
			data.plugins.entries[name] = data.plugins.entries[name] || {};
			data.plugins.entries[name].enabled = true;
		}
		delete data.plugins.entries['google-antigravity-auth'];
		writeConfig(file, data);
	},

	// 旧版写入的插件名少了 @scope 前缀
	'plugin-fix-names'({ file }) {
		const OLD = 'openclaw-qqbot';
		const NEW = '@tencent-connect/openclaw-qqbot';
		const data = readConfig(file);
		let result = '';
		data.plugins = data.plugins || {};
		if (Array.isArray(data.plugins.allow)) {
			const idx = data.plugins.allow.indexOf(OLD);
			if (idx !== -1) {
				if (data.plugins.allow.includes(NEW)) {
					data.plugins.allow.splice(idx, 1);
					result = 'REMOVED_DUPLICATE';
				} else {
					data.plugins.allow[idx] = NEW;
					result = 'FIXED';
				}
			}
		}
		if (data.plugins.entries && data.plugins.entries[OLD]) {
			if (!data.plugins.entries[NEW]) data.plugins.entries[NEW] = data.plugins.entries[OLD];
			delete data.plugins.entries[OLD];
			result = 'FIXED_ENTRIES';
		}
		if (result) writeConfig(file, data);
		process.stdout.write(result);
	},

	'plugin-ensure-qqbot'({ file }) {
		const NEW = '@tencent-connect/openclaw-qqbot';
		const data = readConfig(file);
		data.plugins = data.plugins || {};
		if (!Array.isArray(data.plugins.allow)) data.plugins.allow = [];
		data.plugins.allow = data.plugins.allow.filter((n) => n !== 'openclaw-qqbot');
		if (!data.plugins.allow.includes(NEW)) {
			data.plugins.allow.push(NEW);
			writeConfig(file, data);
			process.stdout.write('ADDED');
		}
	},

	// auth-profiles.json 里的单条凭据：auth-profile <api_key|token> <provider> <profile> <secret>
	'auth-profile'({ file, args }) {
		const [type, provider, profile, secret] = args;
		if (!type || !provider || !profile) die('用法: auth-profile <api_key|token> <provider> <profile> <secret>');
		let data = {};
		try {
			data = JSON.parse(fs.readFileSync(file, 'utf8'));
		} catch (e) {
			data = { version: 1, profiles: {}, usageStats: {} };
		}
		data.profiles = data.profiles || {};
		data.profiles[profile] = type === 'token'
			? { type: 'token', provider, token: secret ?? '' }
			: { type: 'api_key', provider, key: secret ?? '' };
		writeConfig(file, data);
	},

	// 注册模型并设为默认
	'model-set'({ file, args }) {
		const mid = args[0];
		if (!mid) die('缺少 model id');
		const data = readConfig(file);
		data.agents = data.agents || {};
		data.agents.defaults = data.agents.defaults || {};
		data.agents.defaults.models = data.agents.defaults.models || {};
		data.agents.defaults.model = data.agents.defaults.model || {};
		data.agents.defaults.models[mid] = {};
		data.agents.defaults.model.primary = mid;
		writeConfig(file, data);
	},

	// provider <name> <baseUrl> <apiKey> <modelId> [display] [ctx] [maxTok]
	provider({ file, args }) {
		const [name, baseUrl, apiKey, modelId, display, ctx, maxTok] = args;
		if (!name || !baseUrl || !modelId) die('用法: provider <name> <baseUrl> <apiKey> <modelId> [display] [ctx] [maxTok]');
		writeProvider(file, name, baseUrl, apiKey || '', [
			[modelId, display || modelId, false, ['text', 'image'], ctx, maxTok]
		], false);
	},

	// Ollama 用原生 api，不走 OpenAI 兼容层
	'provider-ollama'({ file, args }) {
		const [baseUrl, modelId] = args;
		if (!baseUrl || !modelId) die('用法: provider-ollama <baseUrl> <modelId>');
		const data = readConfig(file);
		data.models = data.models || {};
		data.models.providers = data.models.providers || {};
		data.models.mode = 'merge';
		data.models.providers.ollama = {
			baseUrl,
			apiKey: 'ollama-local',
			api: 'ollama',
			models: [buildModel(modelId, modelId, false, ['text'], 128000, 32000)]
		};
		writeConfig(file, data);
	},

	'provider-bailian'({ file, args }) {
		writeProvider(file, 'bailian', 'https://coding.dashscope.aliyuncs.com/v1', args[0] || '', [
			['qwen3.5-plus', 'qwen3.5-plus', false, ['text', 'image'], 1000000, 65536],
			['qwen3-coder-plus', 'qwen3-coder-plus', false, ['text'], 1000000, 65536],
			['qwen3-coder-next', 'qwen3-coder-next', false, ['text'], 262144, 65536],
			['qwen3-max-2026-01-23', 'qwen3-max-2026-01-23', false, ['text'], 262144, 65536],
			['MiniMax-M2.5', 'MiniMax-M2.5', false, ['text'], 204800, 131072],
			['glm-5', 'glm-5', false, ['text'], 202752, 16384],
			['glm-4.7', 'glm-4.7', false, ['text'], 202752, 16384],
			['kimi-k2.5', 'kimi-k2.5', false, ['text', 'image'], 262144, 32768]
		], true);
	},

	'provider-lkeap'({ file, args }) {
		writeProvider(file, 'lkeap', 'https://api.lkeap.cloud.tencent.com/coding/v3', args[0] || '', [
			['tc-code-latest', 'Auto (智能匹配最优模型)', false, ['text'], 128000, 8192],
			['hunyuan-2.0-instruct', 'Tencent HY 2.0 Instruct', false, ['text'], 128000, 16000],
			['hunyuan-2.0-thinking', 'Tencent HY 2.0 Think', true, ['text'], 128000, 64000],
			['hunyuan-t1', 'Hunyuan-T1', true, ['text'], 32000, 64000],
			['hunyuan-turbos', 'Hunyuan-TurboS', false, ['text'], 32000, 16000],
			['minimax-m2.5', 'MiniMax-M2.5', false, ['text'], 204800, 131072],
			['kimi-k2.5', 'Kimi-K2.5', false, ['text', 'image'], 262144, 32768],
			['glm-5', 'GLM-5', false, ['text'], 202752, 8192]
		], true);
	},

	// 清掉旧版错误塞进顶层 models 的提供商键；有改动时回显键名
	'drop-legacy-models'({ file }) {
		const BAD = ['openai', 'anthropic', 'google', 'openrouter', 'deepseek', 'github-copilot', 'dashscope', 'xai', 'groq', 'siliconflow', 'custom'];
		const data = readConfig(file);
		const found = data.models && typeof data.models === 'object'
			? Object.keys(data.models).filter((k) => BAD.includes(k))
			: [];
		if (!found.length) return;
		for (const k of found) delete data.models[k];
		const rest = Object.keys(data.models).filter((k) => k !== 'mode' && k !== 'providers');
		if (!data.models.providers && rest.length === 0) delete data.models;
		writeConfig(file, data);
		process.stdout.write(found.join(','));
	},

	// 重置时清掉消息渠道相关插件：entries 里的整条删掉，allow 里的按关键词过滤
	'reset-channels'({ file }) {
		const CHANNEL_PLUGINS = ['openclaw-qqbot', '@tencent-connect/openclaw-qqbot', 'openclaw-lark', '@larksuite/openclaw-lark'];
		const CHANNEL_WORDS = ['qqbot', 'lark', 'telegram', 'discord', 'slack', 'whatsapp'];
		const data = readConfig(file);
		if (!data.plugins) return;
		let modified = false;
		if (data.plugins.entries) {
			for (const p of CHANNEL_PLUGINS) {
				if (data.plugins.entries[p]) {
					delete data.plugins.entries[p];
					modified = true;
				}
			}
		}
		if (Array.isArray(data.plugins.allow)) {
			const before = data.plugins.allow.length;
			data.plugins.allow = data.plugins.allow.filter((p) => !CHANNEL_WORDS.some((w) => String(p).includes(w)));
			if (data.plugins.allow.length !== before) modified = true;
		}
		if (modified) {
			writeConfig(file, data);
			process.stdout.write('CLEANED');
		}
	}
};

function main() {
	const argv = process.argv.slice(2);
	let file = DEFAULT_FILE;
	const rest = [];
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--file') { file = argv[++i]; continue; }
		rest.push(argv[i]);
	}
	const [cmd, ...args] = rest;
	const handler = HANDLERS[cmd];
	if (!handler) die(`未知子命令: ${cmd || '(空)'}\n可用: ${Object.keys(HANDLERS).sort().join(' ')}`);
	if (!file) die('缺少配置文件路径（用 --file 或 OC_JSON_CONFIG 指定）');
	handler({ file, args });
}

main();
