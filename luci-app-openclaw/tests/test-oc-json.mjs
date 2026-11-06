// oc-json.mjs 回归测试：等价性 + 边界。用法: node tests/test-oc-json.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(HERE, '..', 'root', 'usr', 'share', 'openclaw', 'oc-json.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-json-test-'));
const CFG = path.join(tmp, 'openclaw.json');

let failed = 0;
function run(args, file = CFG) {
	return execFileSync(process.execPath, [TOOL, ...args, '--file', file], { encoding: 'utf8' });
}
function check(name, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected);
	if (!ok) failed++;
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `\n      期望 ${JSON.stringify(expected)}\n      实际 ${JSON.stringify(actual)}`}`);
}
function cfg() {
	return JSON.parse(fs.readFileSync(CFG, 'utf8'));
}
function reset(content = {}) {
	fs.writeFileSync(CFG, JSON.stringify(content, null, 2));
}

// get / set
reset();
check('get 不存在的路径返回空', run(['get', 'a.b']), '');
run(['set', 'a.b', 'hello']);
check('set 建出嵌套路径', cfg().a.b, 'hello');
run(['set', 'a.b', 'second']);
check('set 覆盖旧值', cfg().a.b, 'second');
run(['set', 'n', '00123']);
check('set 始终写字符串', cfg().n, '00123');
check('get 读回字符串', run(['get', 'n']), '00123');

// 空值与特殊字符
run(['set', 'x.y', '']);
check('set 空字符串', cfg().x.y, '');
run(['set', 'q', 'he said "hi" \\ end']);
check('set 引号与反斜杠原样落盘', cfg().q, 'he said "hi" \\ end');

// check
fs.writeFileSync(CFG, '{ not json');
let checkRc = 0;
try { run(['check']); } catch (e) { checkRc = e.status; }
check('check 对坏 JSON 返回非 0', checkRc === 0, false);

// 领域：model-set 支持带点的模型名
reset();
run(['model-set', 'openai/gpt-5.2']);
check('model-set 注册键含点', cfg().agents.defaults.models['openai/gpt-5.2'], {});
check('model-set 设为默认', cfg().agents.defaults.model.primary, 'openai/gpt-5.2');

// 领域：provider 单模型
reset();
run(['provider', 'dashscope', 'https://x/v1', 'sk-1', 'qwen-max', 'Qwen Max', '64000', '8192']);
const prov = cfg().models.providers.dashscope;
check('provider baseUrl', prov.baseUrl, 'https://x/v1');
check('provider api', prov.api, 'openai-completions');
check('provider contextWindow', prov.models[0].contextWindow, 64000);
check('provider maxTokens', prov.models[0].maxTokens, 8192);
check('provider 名称', prov.models[0].name, 'Qwen Max');
check('provider 不写 agents.defaults', cfg().agents, undefined);

// 领域：批量 provider 同时登记默认模型
reset();
run(['provider-bailian', 'sk-2']);
check('bailian 模型数', cfg().models.providers.bailian.models.length, 8);
check('bailian 登记默认模型', Object.keys(cfg().agents.defaults.models).length, 8);
check('bailian key 前缀', Object.keys(cfg().agents.defaults.models)[0].startsWith('bailian/'), true);

// 领域：auth-profile 打到另一个文件
const AUTH = path.join(tmp, 'auth-profiles.json');
run(['auth-profile', 'api_key', 'openai', 'openai:manual', 'sk-abc'], AUTH);
const auth = JSON.parse(fs.readFileSync(AUTH, 'utf8'));
check('auth-profile 新建骨架 version', auth.version, 1);
check('auth-profile type', auth.profiles['openai:manual'].type, 'api_key');
check('auth-profile key', auth.profiles['openai:manual'].key, 'sk-abc');
run(['auth-profile', 'token', 'github-copilot', 'github-copilot:github', 'gh-1'], AUTH);
check('auth-profile 保留已有条目', Object.keys(JSON.parse(fs.readFileSync(AUTH, 'utf8')).profiles).length, 2);

// 领域：插件名修复
reset({ plugins: { allow: ['openclaw-qqbot'], entries: { 'openclaw-qqbot': { enabled: true } } } });
check('plugin-fix-names 返回值', run(['plugin-fix-names']), 'FIXED_ENTRIES');
check('plugin-fix-names allow 已替换', cfg().plugins.allow, ['@tencent-connect/openclaw-qqbot']);
check('plugin-fix-names entries 已迁移', cfg().plugins.entries['@tencent-connect/openclaw-qqbot'].enabled, true);

reset({ plugins: { allow: ['openclaw-qqbot', '@tencent-connect/openclaw-qqbot'] } });
check('plugin-fix-names 去重', run(['plugin-fix-names']), 'REMOVED_DUPLICATE');
check('plugin-fix-names 只留正确名字', cfg().plugins.allow, ['@tencent-connect/openclaw-qqbot']);

reset({ plugins: { allow: [] } });
check('plugin-ensure-qqbot 追加', run(['plugin-ensure-qqbot']), 'ADDED');
check('plugin-ensure-qqbot 结果', cfg().plugins.allow, ['@tencent-connect/openclaw-qqbot']);

// 领域：auth-plugins
reset({ plugins: { entries: { 'google-antigravity-auth': { enabled: true } } } });
run(['auth-plugins']);
check('auth-plugins 删除旧插件', cfg().plugins.entries['google-antigravity-auth'], undefined);
check('auth-plugins 开启四个', Object.keys(cfg().plugins.entries).length, 4);

// 领域：drop-legacy-models
reset({ models: { openai: {}, anthropic: {}, mode: 'merge', providers: { a: {} } } });
check('drop-legacy-models 回显键名', run(['drop-legacy-models']), 'openai,anthropic');
check('drop-legacy-models 保留 providers', Object.keys(cfg().models).sort(), ['mode', 'providers']);

reset({ models: { openai: {} } });
run(['drop-legacy-models']);
check('drop-legacy-models 空壳时整块删除', cfg().models, undefined);

// 领域：reset-channels
reset({ plugins: { entries: { '@tencent-connect/openclaw-qqbot': {}, keepme: {} } } });
run(['reset-channels']);
check('reset-channels 只清渠道插件', Object.keys(cfg().plugins.entries), ['keepme']);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed === 0 ? 'ALL PASS' : `${failed} 项失败`);
process.exit(failed === 0 ? 0 : 1);
