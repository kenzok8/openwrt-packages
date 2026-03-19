#!/bin/sh
# ============================================================================
# OpenClaw 配置管理工具 — OpenWrt 适配版
# 基于原始 oc-config.sh 移植，适配 ash/busybox 环境
# ============================================================================

# ── 颜色 ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

# ── 端口检查兼容函数 (ss 或 netstat) ──
# check_port_listening <port> — 检查端口是否在监听，返回 0/1
check_port_listening() {
	local p="$1"
	if command -v ss >/dev/null 2>&1; then
		ss -ltn 2>/dev/null | grep -q ":${p} "
	else
		netstat -tln 2>/dev/null | grep -q ":${p} "
	fi
}
# get_pid_by_port <port> — 获取监听指定端口的进程 PID
get_pid_by_port() {
	local p="$1"
	if command -v ss >/dev/null 2>&1; then
		ss -tlnp 2>/dev/null | grep ":${p} " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1
	else
		netstat -tlnp 2>/dev/null | grep ":${p} " | sed -n 's|.* \([0-9]*\)/.*|\1|p' | head -1
	fi
}

# ── 路径 (OpenWrt 适配) ──
NODE_BASE="${NODE_BASE:-/opt/openclaw/node}"
OC_GLOBAL="${OC_GLOBAL:-/opt/openclaw/global}"
OC_DATA="${OC_DATA:-/opt/openclaw/data}"
NODE_BIN="${NODE_BASE}/bin/node"
OC_STATE_DIR="${OC_DATA}/.openclaw"
CONFIG_FILE="${OC_STATE_DIR}/openclaw.json"

export HOME="$OC_DATA"
export OPENCLAW_HOME="$OC_DATA"
export OPENCLAW_STATE_DIR="$OC_STATE_DIR"
export OPENCLAW_CONFIG_PATH="$CONFIG_FILE"
export NODE_ICU_DATA="${NODE_BASE}/share/icu"
export PATH="${NODE_BASE}/bin:${OC_GLOBAL}/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

# ── 查找 openclaw 入口 ──
OC_PKG_DIR=""
for d in "${OC_GLOBAL}/lib/node_modules/openclaw" "${OC_GLOBAL}/node_modules/openclaw" "${NODE_BASE}/lib/node_modules/openclaw"; do
	if [ -d "$d" ]; then
		OC_PKG_DIR="$d"
		break
	fi
done

OC_ENTRY=""
if [ -n "$OC_PKG_DIR" ]; then
	if [ -f "${OC_PKG_DIR}/openclaw.mjs" ]; then
		OC_ENTRY="${OC_PKG_DIR}/openclaw.mjs"
	elif [ -f "${OC_PKG_DIR}/dist/cli.js" ]; then
		OC_ENTRY="${OC_PKG_DIR}/dist/cli.js"
	fi
fi

oc_cmd() {
	if [ -n "$OC_ENTRY" ] && [ -x "$NODE_BIN" ]; then
		"$NODE_BIN" "$OC_ENTRY" "$@" 2>&1
		local rc=$?
		# 修复权限: oc_cmd 以 root 运行但配置文件应属于 openclaw 用户
		chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
		chown openclaw:openclaw "${CONFIG_FILE}.bak" 2>/dev/null || true
		return $rc
	else
		echo "ERROR: OpenClaw 未安装或 Node.js 不可用"
		return 1
	fi
}

# ── JSON 读写 (使用 Node.js) ──
json_get() {
	if [ ! -f "$CONFIG_FILE" ]; then echo ""; return; fi
	_JS_KEY="$1" "$NODE_BIN" -e "
		const fs=require('fs');
		try{
			const d=JSON.parse(fs.readFileSync('${CONFIG_FILE}','utf8'));
			const ks=process.env._JS_KEY.split('.');let v=d;
			for(const k of ks){v=v[k];if(v===undefined){console.log('');process.exit(0);}}
			if(typeof v==='object')console.log(JSON.stringify(v));else console.log(v);
		}catch(e){console.log('');}
	" 2>/dev/null
}

json_set() {
	local key="$1" value="$2"
	local _js_err=""
	
	# 步骤1: 确保配置文件存在
	if [ ! -f "$CONFIG_FILE" ]; then
		# 检查父目录是否可创建
		local parent_dir="$(dirname "$CONFIG_FILE")"
		if ! mkdir -p "$parent_dir" 2>/dev/null; then
			echo "ERROR: 无法创建配置目录 $parent_dir" >&2
			echo "HINT: 请检查 /opt/openclaw/data 是否存在且有写权限" >&2
			return 1
		fi
		
		# 检查目录权限
		if [ ! -w "$parent_dir" ]; then
			echo "ERROR: 配置目录 $parent_dir 不可写" >&2
			echo "HINT: 请运行: chmod 755 $parent_dir" >&2
			return 1
		fi
		
		# 尝试修复所有权
		chown -R openclaw:openclaw "$OC_STATE_DIR" 2>/dev/null || true
		
		# 创建空配置文件
		if ! echo '{}' > "$CONFIG_FILE" 2>/dev/null; then
			echo "ERROR: 无法创建配置文件 $CONFIG_FILE" >&2
			echo "HINT: 请检查磁盘空间和文件系统状态" >&2
			return 1
		fi
		
		chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
	fi
	
	# 步骤2: 检查配置文件是否可写
	if [ ! -w "$CONFIG_FILE" ]; then
		echo "ERROR: 配置文件 $CONFIG_FILE 不可写" >&2
		echo "HINT: 请运行: chmod 644 $CONFIG_FILE" >&2
		return 1
	fi
	
	# 步骤3: 检查 Node.js 是否可用
	if [ ! -x "$NODE_BIN" ]; then
		echo "ERROR: Node.js 不可用: $NODE_BIN" >&2
		echo "HINT: 请先运行 openclaw-env setup 安装 Node.js" >&2
		return 1
	fi
	
	# 步骤4: 使用临时文件传递值，避免环境变量转义问题
	local tmp_val_file="/tmp/.oc_json_val_$$"
	if ! printf '%s' "$value" > "$tmp_val_file" 2>/dev/null; then
		echo "ERROR: 无法创建临时文件 $tmp_val_file" >&2
		return 1
	fi
	
	# 步骤5: 执行 JSON 写入
	_JS_KEY="$key" _JS_DEBUG="${OC_CONFIG_DEBUG:-0}" "$NODE_BIN" -e "
		const fs=require('fs');let d={};
		const debug=process.env._JS_DEBUG==='1';
		try{
			const content=fs.readFileSync('${CONFIG_FILE}','utf8');
			d=JSON.parse(content);
		}catch(e){
			if(debug)console.error('JSON parse warning:',e.message);
		}
		const ks=process.env._JS_KEY.split('.');let o=d;
		for(let i=0;i<ks.length-1;i++){
			if(!o[ks[i]]||typeof o[ks[i]]!=='object')o[ks[i]]={};
			o=o[ks[i]];
		}
		// 读取值并作为字符串保存
		let v=fs.readFileSync('${tmp_val_file}','utf8');
		o[ks[ks.length-1]]=v;
		try{
			fs.writeFileSync('${CONFIG_FILE}',JSON.stringify(d,null,2));
			if(debug)console.log('JSON saved successfully');
		}catch(e){
			console.error('ERROR: Failed to write config:',e.message);
			process.exit(1);
		}
	" 2>&1
	local _js_rc=$?
	
	# 清理临时文件
	rm -f "$tmp_val_file" 2>/dev/null
	
	# 步骤6: 检查执行结果
	if [ $_js_rc -ne 0 ]; then
		echo "ERROR: JSON 写入失败 (exit code: $_js_rc)" >&2
		return 1
	fi
	
	# 步骤7: 修复文件所有权
	chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
	
	return 0
}

# ── 启用 auth 插件 ──
enable_auth_plugins() {
	[ ! -f "$CONFIG_FILE" ] && return
	"$NODE_BIN" -e "
		const fs=require('fs');
		try{
			const d=JSON.parse(fs.readFileSync('${CONFIG_FILE}','utf8'));
			if(!d.plugins)d.plugins={};if(!d.plugins.entries)d.plugins.entries={};
			const e=d.plugins.entries;
			['qwen-portal-auth','copilot-proxy','google-gemini-cli-auth','minimax-portal-auth'].forEach(p=>{
				if(!e[p])e[p]={};e[p].enabled=true;
			});
			delete e['google-antigravity-auth'];
			fs.writeFileSync('${CONFIG_FILE}',JSON.stringify(d,null,2));
		}catch(e){}
	" 2>/dev/null
}

# ── 修复插件配置中的插件名称不匹配问题 ──
# v2026.3.13: OpenClaw 加强了配置验证，plugins.allow 中的名称必须与实际插件名完全匹配
# 问题: 旧版本写入的是 "openclaw-qqbot"，但实际插件名是 "@tencent-connect/openclaw-qqbot"
# 此函数会自动检测并修正不匹配的插件名称
fix_plugin_config() {
	[ ! -f "$CONFIG_FILE" ] && return
	[ ! -x "$NODE_BIN" ] && return
	
	# 检查是否存在 qqbot 插件目录
	local qqbot_ext_dir="${OC_STATE_DIR}/extensions/openclaw-qqbot"
	[ ! -d "$qqbot_ext_dir" ] && return
	
	# 读取并修复 plugins.allow 中的插件名称
	local fixed=0
	"$NODE_BIN" -e "
		const fs=require('fs');
		try{
			const d=JSON.parse(fs.readFileSync('${CONFIG_FILE}','utf8'));
			if(!d.plugins)d.plugins={};
			
			// 修复 plugins.allow 数组中的插件名称
			if(Array.isArray(d.plugins.allow)){
				const oldName='openclaw-qqbot';
				const newName='@tencent-connect/openclaw-qqbot';
				const idx=d.plugins.allow.indexOf(oldName);
				if(idx!==-1){
					// 检查是否已有正确的名称
					if(!d.plugins.allow.includes(newName)){
						d.plugins.allow[idx]=newName;
						console.log('FIXED');
					}else{
						// 已有正确名称，删除错误的
						d.plugins.allow.splice(idx,1);
						console.log('REMOVED_DUPLICATE');
					}
					fs.writeFileSync('${CONFIG_FILE}',JSON.stringify(d,null,2));
				}
			}
			
			// 同时修复 plugins.entries 中的键名
			if(d.plugins.entries && d.plugins.entries['openclaw-qqbot']){
				if(!d.plugins.entries['@tencent-connect/openclaw-qqbot']){
					d.plugins.entries['@tencent-connect/openclaw-qqbot']=d.plugins.entries['openclaw-qqbot'];
				}
				delete d.plugins.entries['openclaw-qqbot'];
				fs.writeFileSync('${CONFIG_FILE}',JSON.stringify(d,null,2));
				console.log('FIXED_ENTRIES');
			}
		}catch(e){}
	" 2>/dev/null | while read line; do
		case "$line" in
			FIXED|REMOVED_DUPLICATE|FIXED_ENTRIES)
				echo -e "  ${GREEN}✅ 已修复插件配置名称: openclaw-qqbot → @tencent-connect/openclaw-qqbot${NC}"
				fixed=1
				;;
		esac
	done
	
	# 确保配置文件权限正确
	chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
	
	return $fixed
}

# ── 确保 qqbot 插件在 plugins.allow 中 ──
ensure_qqbot_plugin_allowed() {
	[ ! -f "$CONFIG_FILE" ] && return
	[ ! -x "$NODE_BIN" ] && return
	
	"$NODE_BIN" -e "
		const fs=require('fs');
		try{
			const d=JSON.parse(fs.readFileSync('${CONFIG_FILE}','utf8'));
			if(!d.plugins)d.plugins={};
			if(!Array.isArray(d.plugins.allow))d.plugins.allow=[];
			
			const correctName='@tencent-connect/openclaw-qqbot';
			const oldName='openclaw-qqbot';
			
			// 移除旧的不正确名称
			d.plugins.allow=d.plugins.allow.filter(n=>n!==oldName);
			
			// 添加正确的名称（如果不存在）
			if(!d.plugins.allow.includes(correctName)){
				d.plugins.allow.push(correctName);
				fs.writeFileSync('${CONFIG_FILE}',JSON.stringify(d,null,2));
				console.log('ADDED');
			}
		}catch(e){}
	" 2>/dev/null
	
	chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
}

# ── 模型认证: 将 API Key 写入 auth-profiles.json (而非 openclaw.json) ──
# 用法: auth_set_apikey <provider> <api_key> [profile_id]
# 例: auth_set_apikey openai sk-xxx
#     auth_set_apikey anthropic sk-ant-xxx
#     auth_set_apikey openai-compatible sk-xxx custom:manual
auth_set_apikey() {
	local provider="$1" api_key="$2" profile_id="${3:-${1}:manual}"
	local auth_dir="${OC_STATE_DIR}/agents/main/agent"
	local auth_file="${auth_dir}/auth-profiles.json"
	mkdir -p "$auth_dir"
	chown -R openclaw:openclaw "${OC_STATE_DIR}/agents" 2>/dev/null || true
	_AP_PROVIDER="$provider" _AP_KEY="$api_key" _AP_PROFILE="$profile_id" "$NODE_BIN" -e "
		const fs=require('fs'),f=process.env._AP_FILE||'${auth_file}';
		let d={version:1,profiles:{},usageStats:{}};
		try{d=JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){}
		if(!d.profiles)d.profiles={};
		d.profiles[process.env._AP_PROFILE]={
			type:'api_key',
			provider:process.env._AP_PROVIDER,
			key:process.env._AP_KEY
		};
		fs.writeFileSync(f,JSON.stringify(d,null,2));
	" 2>/dev/null
	chown openclaw:openclaw "$auth_file" 2>/dev/null || true
}

# ── GitHub Copilot Token 写入 auth-profiles.json (type:token) ──
# GitHub Copilot 使用 token 类型而非 api_key，OpenClaw 会自动兑换 Copilot session token
# 用法: auth_set_copilot_token <github_token>
auth_set_copilot_token() {
	local github_token="$1"
	local auth_dir="${OC_STATE_DIR}/agents/main/agent"
	local auth_file="${auth_dir}/auth-profiles.json"
	mkdir -p "$auth_dir"
	chown -R openclaw:openclaw "${OC_STATE_DIR}/agents" 2>/dev/null || true
	_AP_TOKEN="$github_token" "$NODE_BIN" -e "
		const fs=require('fs'),f='${auth_file}';
		let d={version:1,profiles:{},usageStats:{}};
		try{d=JSON.parse(fs.readFileSync(f,'utf8'));}catch(e){}
		if(!d.profiles)d.profiles={};
		d.profiles['github-copilot:github']={
			type:'token',
			provider:'github-copilot',
			token:process.env._AP_TOKEN
		};
		fs.writeFileSync(f,JSON.stringify(d,null,2));
	" 2>/dev/null
	chown openclaw:openclaw "$auth_file" 2>/dev/null || true
}

# ── 注册模型到 agents.defaults.models 并设为默认 ──
# 用法: register_and_set_model <model_id>
# 例: register_and_set_model openai/gpt-5.2
#     register_and_set_model anthropic/claude-sonnet-4
# 注意: 模型 ID 可能含 "." (如 gpt-5.2)，不能用 json_set (以 . 分割路径)
register_and_set_model() {
	local model_id="$1"
	_RSM_MID="$model_id" "$NODE_BIN" -e "
		const fs=require('fs');
		let d={};
		try{d=JSON.parse(fs.readFileSync('${CONFIG_FILE}','utf8'));}catch(e){}
		if(!d.agents)d.agents={};
		if(!d.agents.defaults)d.agents.defaults={};
		if(!d.agents.defaults.models)d.agents.defaults.models={};
		if(!d.agents.defaults.model)d.agents.defaults.model={};
		const mid=process.env._RSM_MID;
		d.agents.defaults.models[mid]={};
		d.agents.defaults.model.primary=mid;
		fs.writeFileSync('${CONFIG_FILE}',JSON.stringify(d,null,2));
	" 2>/dev/null
	chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
}

# ── 注册自定义提供商 (需要 baseUrl 的 OpenAI 兼容提供商) ──
# 用法: register_custom_provider <provider_name> <base_url> <api_key> <model_id> [model_display_name] [context_window] [max_tokens]
# 例: register_custom_provider dashscope https://dashscope.aliyuncs.com/compatible-mode/v1 sk-xxx qwen-max "Qwen Max"
# 例: register_custom_provider bailian https://coding.dashscope.aliyuncs.com/v1 sk-sp-xxx qwen3.5-plus "qwen3.5-plus" 1000000 65536
register_custom_provider() {
	local provider_name="$1" base_url="$2" api_key="$3" model_id="$4" model_display="${5:-$4}"
	local ctx_window="${6:-128000}" max_tok="${7:-32000}"
	_RCP_PROV="$provider_name" _RCP_URL="$base_url" _RCP_KEY="$api_key" _RCP_MID="$model_id" _RCP_MNAME="$model_display" _RCP_CTX="$ctx_window" _RCP_MAXTOK="$max_tok" "$NODE_BIN" -e "
		const fs=require('fs');
		let d={};
		try{d=JSON.parse(fs.readFileSync('${CONFIG_FILE}','utf8'));}catch(e){}
		if(!d.models)d.models={};
		if(!d.models.providers)d.models.providers={};
		d.models.mode='merge';
		const prov=process.env._RCP_PROV;
		d.models.providers[prov]={
			baseUrl:process.env._RCP_URL,
			apiKey:process.env._RCP_KEY,
			api:'openai-completions',
			models:[{
				id:process.env._RCP_MID,
				name:process.env._RCP_MNAME,
				reasoning:false,
				input:['text','image'],
				cost:{input:0,output:0,cacheRead:0,cacheWrite:0},
				contextWindow:parseInt(process.env._RCP_CTX)||128000,
				maxTokens:parseInt(process.env._RCP_MAXTOK)||32000
			}]
		};
		fs.writeFileSync('${CONFIG_FILE}',JSON.stringify(d,null,2));
	" 2>/dev/null
	chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
}

# ── 注册 Coding Plan 提供商 (多模型批量注册) ──
# 用法: register_codingplan_provider <api_key>
# 按阿里云官方文档注册 bailian 提供商，包含所有 Coding Plan 套餐支持的模型
register_codingplan_provider() {
	local api_key="$1"
	_RCP_KEY="$api_key" "$NODE_BIN" -e "
		const fs=require('fs');
		let d={};
		try{d=JSON.parse(fs.readFileSync('${CONFIG_FILE}','utf8'));}catch(e){}
		if(!d.models)d.models={};
		if(!d.models.providers)d.models.providers={};
		d.models.mode='merge';
		d.models.providers['bailian']={
			baseUrl:'https://coding.dashscope.aliyuncs.com/v1',
			apiKey:process.env._RCP_KEY,
			api:'openai-completions',
			models:[
				{id:'qwen3.5-plus',name:'qwen3.5-plus',reasoning:false,input:['text','image'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:1000000,maxTokens:65536},
				{id:'qwen3-coder-plus',name:'qwen3-coder-plus',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:1000000,maxTokens:65536},
				{id:'qwen3-coder-next',name:'qwen3-coder-next',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:262144,maxTokens:65536},
				{id:'qwen3-max-2026-01-23',name:'qwen3-max-2026-01-23',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:262144,maxTokens:65536},
				{id:'MiniMax-M2.5',name:'MiniMax-M2.5',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:204800,maxTokens:131072},
				{id:'glm-5',name:'glm-5',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:202752,maxTokens:16384},
				{id:'glm-4.7',name:'glm-4.7',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:202752,maxTokens:16384},
				{id:'kimi-k2.5',name:'kimi-k2.5',reasoning:false,input:['text','image'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:262144,maxTokens:32768}
			]
		};
		if(!d.agents)d.agents={};
		if(!d.agents.defaults)d.agents.defaults={};
		if(!d.agents.defaults.models)d.agents.defaults.models={};
		['qwen3.5-plus','qwen3-coder-plus','qwen3-coder-next','qwen3-max-2026-01-23','MiniMax-M2.5','glm-5','glm-4.7','kimi-k2.5'].forEach(m=>{
			d.agents.defaults.models['bailian/'+m]={};
		});
		fs.writeFileSync('${CONFIG_FILE}',JSON.stringify(d,null,2));
	" 2>/dev/null
	chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
}

# ── 注册腾讯云 Coding Plan 提供商 (多模型批量注册) ──
# 用法: register_lkeap_codingplan_provider <api_key>
# 按腾讯云官方文档 (https://cloud.tencent.com/document/product/1772/128949) 注册
# provider name: lkeap, Base URL: https://api.lkeap.cloud.tencent.com/coding/v3
register_lkeap_codingplan_provider() {
	local api_key="$1"
	_RCP_KEY="$api_key" "$NODE_BIN" -e "
		const fs=require('fs');
		let d={};
		try{d=JSON.parse(fs.readFileSync('${CONFIG_FILE}','utf8'));}catch(e){}
		if(!d.models)d.models={};
		if(!d.models.providers)d.models.providers={};
		d.models.mode='merge';
		d.models.providers['lkeap']={
			baseUrl:'https://api.lkeap.cloud.tencent.com/coding/v3',
			apiKey:process.env._RCP_KEY,
			api:'openai-completions',
			models:[
				{id:'tc-code-latest',name:'Auto (智能匹配最优模型)',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:128000,maxTokens:8192},
				{id:'hunyuan-2.0-instruct',name:'Tencent HY 2.0 Instruct',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:128000,maxTokens:16000},
				{id:'hunyuan-2.0-thinking',name:'Tencent HY 2.0 Think',reasoning:true,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:128000,maxTokens:64000},
				{id:'hunyuan-t1',name:'Hunyuan-T1',reasoning:true,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32000,maxTokens:64000},
				{id:'hunyuan-turbos',name:'Hunyuan-TurboS',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32000,maxTokens:16000},
				{id:'minimax-m2.5',name:'MiniMax-M2.5',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:204800,maxTokens:131072},
				{id:'kimi-k2.5',name:'Kimi-K2.5',reasoning:false,input:['text','image'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:262144,maxTokens:32768},
				{id:'glm-5',name:'GLM-5',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:202752,maxTokens:8192}
			]
		};
		if(!d.agents)d.agents={};
		if(!d.agents.defaults)d.agents.defaults={};
		if(!d.agents.defaults.models)d.agents.defaults.models={};
		['tc-code-latest','hunyuan-2.0-instruct','hunyuan-2.0-thinking','hunyuan-t1','hunyuan-turbos','minimax-m2.5','kimi-k2.5','glm-5'].forEach(m=>{
			d.agents.defaults.models['lkeap/'+m]={};
		});
		fs.writeFileSync('${CONFIG_FILE}',JSON.stringify(d,null,2));
	" 2>/dev/null
	chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
}

# ── 辅助函数 ──

# 清理输入: 去除 ANSI 转义序列、不可见字符，只保留 ASCII 可打印字符
sanitize_input() {
	# 1) tr -cd ' -~' : 只保留 ASCII 0x20-0x7E (去除 ESC/控制字符/Unicode 不可见字符)
	# 2) sed : 去除 ESC 被剥离后残余的 CSI 序列 (如 bracketed paste 的 [200~ [201~)
	# 3) sed : 去除首尾空白
	printf '%s' "$1" | tr -cd ' -~' | sed 's/\[[0-9;]*[a-zA-Z~]//g' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//'
}

prompt_with_default() {
	local prompt="$1" default="$2" varname="$3"
	if [ -n "$default" ]; then
		printf "  ${CYAN}${prompt} [${default}]:${NC} " >&2
	else
		printf "  ${CYAN}${prompt}:${NC} " >&2
	fi
	read input
	input=$(sanitize_input "$input")
	local _result="${input:-$default}"
	export "__prompt_result__=$_result"
	eval "$varname=\"\$__prompt_result__\""
	unset __prompt_result__
}

confirm_yes() {
	local ans="$1"
	case "$ans" in y|Y|yes|YES|Yes) return 0 ;; *) return 1 ;; esac
}

restart_gateway() {
	echo ""
	echo -e "  ${YELLOW}正在重启 Gateway...${NC}"

	# 修复数据目录权限 (root 用户操作可能改变了文件属主)
	chown -R openclaw:openclaw "$OC_DATA" 2>/dev/null || true

	local port
	port=$(json_get gateway.port)
	port=${port:-18789}

	# ── kill gateway 进程，让 procd respawn ──
	/etc/init.d/openclaw restart_gateway >/dev/null 2>&1

	# ── 等待端口恢复 (最多 30 秒，含端口释放 + Node.js 冷启动) ──
	echo -e "  ${YELLOW}⏳ Gateway 启动中，请稍候 (约 15-30 秒)...${NC}"
	local waited=0
	while [ $waited -lt 30 ]; do
		sleep 3
		waited=$((waited + 3))
		if check_port_listening "$port"; then
			echo -e "  ${GREEN}✅ Gateway 已重启成功 (${waited}秒)${NC}"
			return 0
		fi
	done

	# 30 秒内没就绪，提示用户但不继续阻塞
	echo -e "  ${YELLOW}⏳ Gateway 仍在启动中，请稍后确认${NC}"
	echo -e "  ${CYAN}   查看日志: logread -e openclaw${NC}"
	echo ""
}

ask_restart() {
	prompt_with_default "是否立即重启 Gateway? (y/n)" "y" do_restart
	confirm_yes "$do_restart" && restart_gateway
}

# ── 查看当前配置 ──
show_current_config() {
	echo ""
	echo -e "${GREEN}┌──────────────────────────────────────────────────────────┐${NC}"
	echo -e "${GREEN}│${NC}  📋 ${BOLD}当前配置概览${NC}"
	echo -e "${GREEN}├──────────────────────────────────────────────────────────┤${NC}"

	local port=$(json_get gateway.port)
	local bind=$(json_get gateway.bind)
	local mode=$(json_get gateway.mode)
	echo -e "${GREEN}│${NC}  网关端口 ............ ${CYAN}${port:-18789}${NC}"
	echo -e "${GREEN}│${NC}  绑定模式 ............ ${CYAN}${bind:-lan}${NC}"
	echo -e "${GREEN}│${NC}  运行模式 ............ ${CYAN}${mode:-local}${NC}"

	local model=$(json_get agents.defaults.model.primary)
	if [ -n "$model" ]; then
		echo -e "${GREEN}│${NC}  活跃模型 ............ ${CYAN}${model}${NC}"
	else
		echo -e "${GREEN}│${NC}  活跃模型 ............ ${YELLOW}未配置${NC}"
	fi

	echo -e "${GREEN}├──────────────────────────────────────────────────────────┤${NC}"
	echo -e "${GREEN}│${NC}  ${BOLD}渠道配置状态${NC}"

	local tg_token=$(json_get channels.telegram.botToken)
	local dc_token=$(json_get channels.discord.botToken)
	local fs_appid=$(json_get channels.feishu.appId)
	local sk_token=$(json_get channels.slack.botToken)
	local qq_appid=$(json_get channels.qqbot.appId)

	if [ -n "$qq_appid" ]; then
		local qq_short=$(echo "$qq_appid" | cut -c1-8)
		echo -e "${GREEN}│${NC}  QQ (qqbot) ......... ${GREEN}✅ 已配置${NC} (AppID: ${qq_short}...)"
	else
		echo -e "${GREEN}│${NC}  QQ (qqbot) ......... ${YELLOW}❌ 未配置${NC}"
	fi
	if [ -n "$tg_token" ]; then
		local tg_short=$(echo "$tg_token" | cut -c1-12)
		echo -e "${GREEN}│${NC}  Telegram ............ ${GREEN}✅ 已配置${NC} (${tg_short}...)"
	else
		echo -e "${GREEN}│${NC}  Telegram ............ ${YELLOW}❌ 未配置${NC}"
	fi
	if [ -n "$dc_token" ]; then
		echo -e "${GREEN}│${NC}  Discord ............. ${GREEN}✅ 已配置${NC}"
	else
		echo -e "${GREEN}│${NC}  Discord ............. ${YELLOW}❌ 未配置${NC}"
	fi
	if [ -n "$fs_appid" ]; then
		local fs_short=$(echo "$fs_appid" | cut -c1-6)
		echo -e "${GREEN}│${NC}  飞书 ................ ${GREEN}✅ 已配置${NC} (AppID: ${fs_short}...)"
	else
		echo -e "${GREEN}│${NC}  飞书 ................ ${YELLOW}❌ 未配置${NC}"
	fi
	if [ -n "$sk_token" ]; then
		echo -e "${GREEN}│${NC}  Slack ............... ${GREEN}✅ 已配置${NC}"
	else
		echo -e "${GREEN}│${NC}  Slack ............... ${YELLOW}❌ 未配置${NC}"
	fi

	echo -e "${GREEN}└──────────────────────────────────────────────────────────┘${NC}"

	echo ""
	echo -e "  ${BOLD}系统信息:${NC}"
	echo -e "  Node.js: $("$NODE_BIN" -v 2>/dev/null || echo '未安装')"
	if [ -n "$OC_ENTRY" ]; then
		echo -e "  OpenClaw: $(oc_cmd --version 2>/dev/null || echo '未知')"
	else
		echo -e "  OpenClaw: 未安装"
	fi
	echo -e "  架构: $(uname -m)"
	local mem_total=$(awk '/MemTotal/{printf "%.0f", $2/1024}' /proc/meminfo 2>/dev/null || echo "?")
	echo -e "  内存: ${mem_total} MB"
}

# ══════════════════════════════════════════════════════════════
# 配置 AI 模型
# ══════════════════════════════════════════════════════════════
configure_model() {
	echo ""
	echo -e "  ${BOLD}🤖 配置 AI 模型提供商${NC}"
	echo ""
	echo -e "  ${GREEN}${BOLD}--- 推荐 ---${NC}"
	echo -e "  ${CYAN}1)${NC} 🌟 官方完整模型配置向导  ${GREEN}(推荐，支持所有提供商)${NC}"
	echo ""
	echo -e "  ${BOLD}--- 快速配置 ---${NC}"
	echo -e "  ${CYAN}2)${NC} OpenAI (GPT-5.2, GPT-5 mini, GPT-4.1)"
	echo -e "  ${CYAN}3)${NC} Anthropic (Claude Sonnet 4, Opus 4, Haiku)"
	echo -e "  ${CYAN}4)${NC} Google Gemini (Gemini 2.5 Pro/Flash, Gemini 3)"
	echo -e "  ${CYAN}5)${NC} OpenRouter (聚合多家模型)"
	echo -e "  ${CYAN}6)${NC} DeepSeek (DeepSeek-V3/R1)"
	echo -e "  ${CYAN}7)${NC} GitHub Copilot (需要 Copilot 订阅)"
	echo -e "  ${CYAN}8)${NC} 阿里云通义千问 Qwen (Portal/API/Coding Plan)"
	echo -e "  ${CYAN}9)${NC} xAI Grok (Grok-3/3-mini)"
	echo -e "  ${CYAN}10)${NC} Groq (Llama 4, Llama 3.3)"
	echo -e "  ${CYAN}11)${NC} 硅基流动 SiliconFlow"
	echo -e "  ${CYAN}12)${NC} Ollama (本地模型，无需 API Key)"
	echo -e "  ${CYAN}13)${NC} 腾讯云 Coding Plan (HY T1/TurboS/GLM-5/Kimi)"
	echo -e "  ${CYAN}14)${NC} 自定义 OpenAI 兼容 API"
	echo -e "  ${CYAN}0)${NC} 返回"
	echo ""
	prompt_with_default "请选择" "1" choice

	case "$choice" in
		1)
			echo ""
			echo -e "  ${CYAN}启动官方完整模型配置向导...${NC}"
			echo -e "  ${YELLOW}提示: ↑↓ 移动, Tab/空格 选中, 回车 确认${NC}"
			echo ""
			echo -e "  ${CYAN}预启用模型认证插件...${NC}"
			enable_auth_plugins
			echo ""
			(oc_cmd configure --section model) || echo -e "  ${YELLOW}配置向导已退出${NC}"
			echo ""
			ask_restart
			;;
		2)
			echo ""
			echo -e "  ${BOLD}OpenAI 配置${NC}"
			echo -e "  ${YELLOW}获取 API Key: https://platform.openai.com/api-keys${NC}"
			echo ""
			prompt_with_default "请输入 OpenAI API Key (sk-...)" "" api_key
			if [ -n "$api_key" ]; then
				auth_set_apikey openai "$api_key"
				echo ""
				echo -e "  ${CYAN}可用模型:${NC}"
				echo -e "    ${CYAN}a)${NC} gpt-5.2       — 最强编程与代理旗舰 (推荐)"
				echo -e "    ${CYAN}b)${NC} gpt-5-mini    — 高性价比推理"
				echo -e "    ${CYAN}c)${NC} gpt-5-nano    — 极速低成本"
				echo -e "    ${CYAN}d)${NC} gpt-4.1       — 最强非推理模型"
				echo -e "    ${CYAN}e)${NC} o3            — 推理模型"
				echo -e "    ${CYAN}f)${NC} o4-mini       — 推理轻量"
				echo -e "    ${CYAN}g)${NC} 手动输入模型名"
				echo ""
				prompt_with_default "请选择模型" "a" model_choice
				case "$model_choice" in
					a) model_name="gpt-5.2" ;;
					b) model_name="gpt-5-mini" ;;
					c) model_name="gpt-5-nano" ;;
					d) model_name="gpt-4.1" ;;
					e) model_name="o3" ;;
					f) model_name="o4-mini" ;;
					g) prompt_with_default "请输入模型名称" "gpt-5.2" model_name ;;
					*) model_name="gpt-5.2" ;;
				esac
				register_and_set_model "openai/${model_name}"
				echo -e "  ${GREEN}✅ OpenAI 已配置，活跃模型: openai/${model_name}${NC}"
			fi
			;;
		3)
			echo ""
			echo -e "  ${BOLD}Anthropic 配置${NC}"
			echo -e "  ${YELLOW}获取 API Key: https://console.anthropic.com/settings/keys${NC}"
			echo ""
			prompt_with_default "请输入 Anthropic API Key (sk-ant-...)" "" api_key
			if [ -n "$api_key" ]; then
				auth_set_apikey anthropic "$api_key"
				echo ""
				echo -e "  ${CYAN}可用模型:${NC}"
				echo -e "    ${CYAN}a)${NC} claude-sonnet-4-20250514   — Claude Sonnet 4 (推荐)"
				echo -e "    ${CYAN}b)${NC} claude-opus-4-20250514     — Claude Opus 4 顶级推理"
				echo -e "    ${CYAN}c)${NC} claude-haiku-4-5           — Claude Haiku 4.5 轻量快速"
				echo -e "    ${CYAN}d)${NC} claude-sonnet-4.5          — Claude Sonnet 4.5"
				echo -e "    ${CYAN}e)${NC} claude-sonnet-4.6          — Claude Sonnet 4.6"
				echo -e "    ${CYAN}f)${NC} 手动输入模型名"
				echo ""
				prompt_with_default "请选择模型" "a" model_choice
				case "$model_choice" in
					a) model_name="claude-sonnet-4-20250514" ;;
					b) model_name="claude-opus-4-20250514" ;;
					c) model_name="claude-haiku-4-5" ;;
					d) model_name="claude-sonnet-4-5" ;;
					e) model_name="claude-sonnet-4-6" ;;
					f) prompt_with_default "请输入模型名称" "claude-sonnet-4-20250514" model_name ;;
					*) model_name="claude-sonnet-4-20250514" ;;
				esac
				register_and_set_model "anthropic/${model_name}"
				echo -e "  ${GREEN}✅ Anthropic 已配置，活跃模型: anthropic/${model_name}${NC}"
			fi
			;;
		4)
			echo ""
			echo -e "  ${BOLD}Google Gemini 配置${NC}"
			echo -e "  ${YELLOW}获取 API Key: https://aistudio.google.com/apikey${NC}"
			echo ""
			prompt_with_default "请输入 Google AI API Key" "" api_key
			if [ -n "$api_key" ]; then
				auth_set_apikey google "$api_key"
				echo ""
				echo -e "  ${CYAN}可用模型:${NC}"
				echo -e "    ${CYAN}a)${NC} gemini-2.5-pro           — 旗舰推理 (推荐)"
				echo -e "    ${CYAN}b)${NC} gemini-2.5-flash         — 快速均衡"
				echo -e "    ${CYAN}c)${NC} gemini-2.5-flash-lite    — 极速低成本"
				echo -e "    ${CYAN}d)${NC} gemini-3-flash-preview   — Gemini 3 Flash 预览"
				echo -e "    ${CYAN}e)${NC} gemini-3-pro-preview     — Gemini 3 Pro 预览"
				echo -e "    ${CYAN}f)${NC} 手动输入模型名"
				echo ""
				prompt_with_default "请选择模型" "a" model_choice
				case "$model_choice" in
					a) model_name="gemini-2.5-pro" ;;
					b) model_name="gemini-2.5-flash" ;;
					c) model_name="gemini-2.5-flash-lite" ;;
					d) model_name="gemini-3-flash-preview" ;;
					e) model_name="gemini-3-pro-preview" ;;
					f) prompt_with_default "请输入模型名称" "gemini-2.5-pro" model_name ;;
					*) model_name="gemini-2.5-pro" ;;
				esac
				register_and_set_model "google/${model_name}"
				echo -e "  ${GREEN}✅ Google Gemini 已配置，活跃模型: google/${model_name}${NC}"
			fi
			;;
		5)
			echo ""
			echo -e "  ${BOLD}OpenRouter 配置${NC}"
			echo -e "  ${YELLOW}获取 API Key: https://openrouter.ai/keys${NC}"
			echo -e "  ${YELLOW}聚合多家模型，一个 Key 可调用所有主流模型${NC}"
			echo ""
			prompt_with_default "请输入 OpenRouter API Key" "" api_key
			if [ -n "$api_key" ]; then
				auth_set_apikey openrouter "$api_key"
				echo ""
				echo -e "  ${CYAN}常用模型 (格式: provider/model):${NC}"
				echo -e "    ${CYAN}a)${NC} anthropic/claude-sonnet-4    — Claude Sonnet 4 (推荐)"
				echo -e "    ${CYAN}b)${NC} anthropic/claude-opus-4      — Claude Opus 4"
				echo -e "    ${CYAN}c)${NC} openai/gpt-5.2              — GPT-5.2"
				echo -e "    ${CYAN}d)${NC} google/gemini-2.5-pro        — Gemini 2.5 Pro"
				echo -e "    ${CYAN}e)${NC} deepseek/deepseek-r1         — DeepSeek R1"
				echo -e "    ${CYAN}f)${NC} meta-llama/llama-4-maverick  — Meta Llama 4"
				echo -e "    ${CYAN}g)${NC} 手动输入模型名"
				echo ""
				prompt_with_default "请选择模型" "a" model_choice
				case "$model_choice" in
					a) model_name="anthropic/claude-sonnet-4" ;;
					b) model_name="anthropic/claude-opus-4" ;;
					c) model_name="openai/gpt-5.2" ;;
					d) model_name="google/gemini-2.5-pro" ;;
					e) model_name="deepseek/deepseek-r1" ;;
					f) model_name="meta-llama/llama-4-maverick" ;;
					g) prompt_with_default "请输入模型名称" "anthropic/claude-sonnet-4" model_name ;;
					*) model_name="anthropic/claude-sonnet-4" ;;
				esac
				register_and_set_model "openrouter/${model_name}"
				echo -e "  ${GREEN}✅ OpenRouter 已配置，活跃模型: openrouter/${model_name}${NC}"
			fi
			;;
		6)
			echo ""
			echo -e "  ${BOLD}DeepSeek 配置${NC}"
			echo -e "  ${YELLOW}获取 API Key: https://platform.deepseek.com/api_keys${NC}"
			echo ""
			prompt_with_default "请输入 DeepSeek API Key" "" api_key
			if [ -n "$api_key" ]; then
				echo ""
				echo -e "  ${CYAN}可用模型:${NC}"
				echo -e "    ${CYAN}a)${NC} deepseek-chat     — DeepSeek-V3 (通用对话)"
				echo -e "    ${CYAN}b)${NC} deepseek-reasoner — DeepSeek-R1 (深度推理)"
				echo -e "    ${CYAN}c)${NC} 手动输入模型名"
				echo ""
				prompt_with_default "请选择模型" "a" model_choice
				case "$model_choice" in
					a) model_name="deepseek-chat" ;;
					b) model_name="deepseek-reasoner" ;;
					c) prompt_with_default "请输入模型名称" "deepseek-chat" model_name ;;
					*) model_name="deepseek-chat" ;;
				esac
				auth_set_apikey deepseek "$api_key"
				register_custom_provider deepseek "https://api.deepseek.com/v1" "$api_key" "$model_name" "$model_name"
				register_and_set_model "deepseek/${model_name}"
				echo -e "  ${GREEN}✅ DeepSeek 已配置，活跃模型: deepseek/${model_name}${NC}"
			fi
			;;
		7)
			echo ""
			echo -e "  ${BOLD}GitHub Copilot 配置${NC}"
			echo -e "  ${YELLOW}需要有效的 GitHub Copilot 订阅 (Free/Pro/Business 均可)${NC}"
			echo ""
			echo -e "  ${CYAN}启动 GitHub Copilot OAuth 登录 (Device Flow)...${NC}"
			echo -e "  ${DIM}请在浏览器中打开显示的 URL，输入授权码完成登录${NC}"
			echo ""
			if oc_cmd models auth login-github-copilot --yes; then
				echo ""
				echo -e "  ${GREEN}✅ GitHub Copilot OAuth 认证成功${NC}"
				echo ""
				echo -e "  ${CYAN}选择默认模型:${NC}"
				echo ""
				echo -e "  ${CYAN}── GPT 系列 ──${NC}"
				echo -e "    ${CYAN}a)${NC}  github-copilot/gpt-4.1           — GPT-4.1 ${GREEN}(推荐)${NC}"
				echo -e "    ${CYAN}b)${NC}  github-copilot/gpt-4o            — GPT-4o"
				echo -e "    ${CYAN}c)${NC}  github-copilot/gpt-5             — GPT-5"
				echo -e "    ${CYAN}d)${NC}  github-copilot/gpt-5-mini        — GPT-5 mini"
				echo -e "    ${CYAN}e)${NC}  github-copilot/gpt-5.1           — GPT-5.1"
				echo -e "    ${CYAN}f)${NC}  github-copilot/gpt-5.2           — GPT-5.2"
				echo -e "    ${CYAN}g)${NC}  github-copilot/gpt-5.2-codex     — GPT-5.2 Codex"
				echo ""
				echo -e "  ${CYAN}── Claude 系列 ──${NC}"
				echo -e "    ${CYAN}h)${NC}  github-copilot/claude-sonnet-4   — Claude Sonnet 4"
				echo -e "    ${CYAN}i)${NC}  github-copilot/claude-sonnet-4.5 — Claude Sonnet 4.5"
				echo -e "    ${CYAN}j)${NC}  github-copilot/claude-sonnet-4.6 — Claude Sonnet 4.6"
				echo ""
				echo -e "  ${CYAN}── Gemini 系列 ──${NC}"
				echo -e "    ${CYAN}k)${NC}  github-copilot/gemini-2.5-pro    — Gemini 2.5 Pro"
				echo ""
				echo -e "    ${CYAN}m)${NC}  手动输入模型名"
				echo ""
				prompt_with_default "请选择模型" "a" model_choice
				case "$model_choice" in
					a) model_name="github-copilot/gpt-4.1" ;;
					b) model_name="github-copilot/gpt-4o" ;;
					c) model_name="github-copilot/gpt-5" ;;
					d) model_name="github-copilot/gpt-5-mini" ;;
					e) model_name="github-copilot/gpt-5.1" ;;
					f) model_name="github-copilot/gpt-5.2" ;;
					g) model_name="github-copilot/gpt-5.2-codex" ;;
					h) model_name="github-copilot/claude-sonnet-4" ;;
					i) model_name="github-copilot/claude-sonnet-4.5" ;;
					j) model_name="github-copilot/claude-sonnet-4.6" ;;
					k) model_name="github-copilot/gemini-2.5-pro" ;;
					m) prompt_with_default "请输入模型名称" "github-copilot/gpt-4.1" model_name ;;
					*) model_name="github-copilot/gpt-4.1" ;;
				esac
				register_and_set_model "$model_name"
				echo -e "  ${GREEN}✅ 活跃模型已设置: ${model_name}${NC}"
			else
				echo -e "  ${YELLOW}OAuth 授权已退出或失败${NC}"
			fi
			;;
		8)
			echo ""
			echo -e "  ${BOLD}阿里云通义千问 Qwen 配置${NC}"
			echo ""
			echo -e "  ${CYAN}配置方式:${NC}"
			echo -e "    ${CYAN}a)${NC} 通过官方向导配置 (Qwen Portal OAuth)"
			echo -e "    ${CYAN}b)${NC} 百炼按量付费 API Key (sk-xxx, 按 token 计费)"
			echo -e "    ${CYAN}c)${NC} ${GREEN}Coding Plan 套餐${NC} (sk-sp-xxx, 按套餐抵扣额度) ${GREEN}★ 推荐${NC}"
			echo ""
			echo -e "  ${DIM}提示: Coding Plan 套餐和百炼按量付费的 API Key / Base URL 不互通，请勿混用${NC}"
			echo ""
			prompt_with_default "请选择" "c" qwen_mode
			case "$qwen_mode" in
				a)
					echo ""
					echo -e "  ${CYAN}启用 Qwen Portal Auth 插件...${NC}"
					enable_auth_plugins
					echo -e "  ${CYAN}启动 Qwen OAuth 授权...${NC}"
					oc_cmd models auth login --provider qwen-portal --set-default || echo -e "  ${YELLOW}OAuth 授权已退出${NC}"
					echo ""
					ask_restart
					return
					;;
				b)
					echo ""
					echo -e "  ${BOLD}百炼按量付费配置${NC}"
					echo -e "  ${YELLOW}获取 API Key: https://dashscope.console.aliyun.com/apiKey${NC}"
					echo -e "  ${DIM}Base URL: https://dashscope.aliyuncs.com/compatible-mode/v1${NC}"
					echo ""
					prompt_with_default "请输入百炼 API Key (sk-...)" "" api_key
					if [ -n "$api_key" ]; then
						echo ""
						echo -e "  ${CYAN}── 千问商业版 ──${NC}"
						echo -e "    ${CYAN}a)${NC}  qwen-max             — 千问Max 旗舰模型 (推荐)"
						echo -e "    ${CYAN}b)${NC}  qwen-plus            — 千问Plus 均衡之选 (已升级Qwen3.5)"
						echo -e "    ${CYAN}c)${NC}  qwen-flash           — 千问Flash 速度最快 (已升级Qwen3.5)"
						echo -e "    ${CYAN}d)${NC}  qwen-turbo           — 千问Turbo 经济实惠"
						echo -e "    ${CYAN}e)${NC}  qwen-long            — 千问Long 超长上下文 (1000万Token)"
						echo -e "  ${CYAN}── 千问Coder ──${NC}"
						echo -e "    ${CYAN}f)${NC}  qwen3-coder-plus     — 代码专用旗舰 (100万上下文)"
						echo -e "    ${CYAN}g)${NC}  qwen3-coder-flash    — 代码专用极速"
						echo -e "  ${CYAN}── 推理模型 ──${NC}"
						echo -e "    ${CYAN}h)${NC}  qwq-plus             — QwQ推理模型 (数学/代码强化)"
						echo -e "  ${CYAN}── 千问开源版 ──${NC}"
						echo -e "    ${CYAN}i)${NC}  qwen3-235b-a22b      — Qwen3 235B MoE"
						echo -e "    ${CYAN}j)${NC}  qwen3-32b            — Qwen3 32B"
						echo -e "    ${CYAN}k)${NC}  qwen3-30b-a3b        — Qwen3 30B MoE"
						echo -e "  ${CYAN}── 第三方模型 ──${NC}"
						echo -e "    ${CYAN}l)${NC}  deepseek-r1           — DeepSeek R1 推理"
						echo -e "    ${CYAN}m)${NC}  deepseek-v3           — DeepSeek V3"
						echo -e "    ${CYAN}n)${NC}  kimi-k2.5            — Kimi K2.5"
						echo -e "    ${CYAN}o)${NC}  glm-5                — 智谱 GLM-5"
						echo -e "    ${CYAN}p)${NC}  MiniMax-M2.5         — MiniMax M2.5"
						echo -e "  ${CYAN}────────────${NC}"
						echo -e "    ${CYAN}z)${NC}  手动输入模型名"
						echo ""
						prompt_with_default "请选择模型" "a" model_choice
						case "$model_choice" in
							a) model_name="qwen-max" ;;
							b) model_name="qwen-plus" ;;
							c) model_name="qwen-flash" ;;
							d) model_name="qwen-turbo" ;;
							e) model_name="qwen-long" ;;
							f) model_name="qwen3-coder-plus" ;;
							g) model_name="qwen3-coder-flash" ;;
							h) model_name="qwq-plus" ;;
							i) model_name="qwen3-235b-a22b" ;;
							j) model_name="qwen3-32b" ;;
							k) model_name="qwen3-30b-a3b" ;;
							l) model_name="deepseek-r1" ;;
							m) model_name="deepseek-v3" ;;
							n) model_name="kimi-k2.5" ;;
							o) model_name="glm-5" ;;
							p) model_name="MiniMax-M2.5" ;;
							z) prompt_with_default "请输入模型名称" "qwen-max" model_name ;;
							*) model_name="qwen-max" ;;
						esac
						auth_set_apikey dashscope "$api_key"
						register_custom_provider dashscope "https://dashscope.aliyuncs.com/compatible-mode/v1" "$api_key" "$model_name" "$model_name"
						register_and_set_model "dashscope/${model_name}"
						echo -e "  ${GREEN}✅ 通义千问已配置 (按量付费)，活跃模型: dashscope/${model_name}${NC}"
					fi
					;;
				c|*)
					echo ""
					echo -e "  ${BOLD}Coding Plan 套餐配置${NC}"
					echo -e "  ${YELLOW}订阅套餐: https://bailian.console.aliyun.com/cn-beijing/?tab=model#/efm/coding_plan${NC}"
					echo -e "  ${YELLOW}获取专属 API Key: 在上方页面获取 Coding Plan 专属 Key (sk-sp-...)${NC}"
					echo -e "  ${DIM}Base URL: https://coding.dashscope.aliyuncs.com/v1${NC}"
					echo -e "  ${DIM}文档: https://help.aliyun.com/zh/model-studio/openclaw-coding-plan${NC}"
					echo ""
					prompt_with_default "请输入 Coding Plan 专属 API Key (sk-sp-...)" "" api_key
					if [ -n "$api_key" ]; then
						echo ""
						echo -e "  ${CYAN}可用模型:${NC}"
						echo -e "    ${CYAN}a)${NC} qwen3.5-plus        — Qwen3.5 Plus (推荐, 100万上下文)"
						echo -e "    ${CYAN}b)${NC} qwen3-coder-plus    — Qwen3 Coder Plus (代码专用, 100万上下文)"
						echo -e "    ${CYAN}c)${NC} qwen3-coder-next    — Qwen3 Coder Next"
						echo -e "    ${CYAN}d)${NC} qwen3-max-2026-01-23 — Qwen3 Max"
						echo -e "    ${CYAN}e)${NC} MiniMax-M2.5        — MiniMax M2.5"
						echo -e "    ${CYAN}f)${NC} glm-5               — 智谱 GLM-5"
						echo -e "    ${CYAN}g)${NC} kimi-k2.5           — Kimi K2.5"
						echo -e "    ${CYAN}h)${NC} 手动输入模型名"
						echo ""
						prompt_with_default "请选择默认模型" "a" model_choice
						case "$model_choice" in
							a) model_name="qwen3.5-plus" ;;
							b) model_name="qwen3-coder-plus" ;;
							c) model_name="qwen3-coder-next" ;;
							d) model_name="qwen3-max-2026-01-23" ;;
							e) model_name="MiniMax-M2.5" ;;
							f) model_name="glm-5" ;;
							g) model_name="kimi-k2.5" ;;
							h) prompt_with_default "请输入模型名称" "qwen3.5-plus" model_name ;;
							*) model_name="qwen3.5-plus" ;;
						esac
						echo ""
						echo -e "  ${CYAN}正在注册 Coding Plan 提供商 (含全部可用模型)...${NC}"
						auth_set_apikey bailian "$api_key"
						register_codingplan_provider "$api_key"
						register_and_set_model "bailian/${model_name}"
						echo -e "  ${GREEN}✅ Coding Plan 已配置，活跃模型: bailian/${model_name}${NC}"
						echo -e "  ${DIM}提示: 套餐内全部模型已注册，可随时在 WebChat 中通过 /model 切换${NC}"
					fi
					;;
			esac
			;;
		9)
			echo ""
			echo -e "  ${BOLD}xAI Grok 配置${NC}"
			echo -e "  ${YELLOW}获取 API Key: https://console.x.ai${NC}"
			echo ""
			prompt_with_default "请输入 xAI API Key" "" api_key
			if [ -n "$api_key" ]; then
				echo ""
				echo -e "  ${CYAN}可用模型:${NC}"
				echo -e "    ${CYAN}a)${NC} grok-4              — Grok 4 旗舰 (推荐)"
				echo -e "    ${CYAN}b)${NC} grok-4-fast         — Grok 4 Fast"
				echo -e "    ${CYAN}c)${NC} grok-3              — Grok 3"
				echo -e "    ${CYAN}d)${NC} grok-3-fast         — Grok 3 Fast"
				echo -e "    ${CYAN}e)${NC} grok-3-mini         — Grok 3 Mini"
				echo -e "    ${CYAN}f)${NC} grok-3-mini-fast    — Grok 3 Mini Fast"
				echo -e "    ${CYAN}g)${NC} 手动输入模型名"
				echo ""
				prompt_with_default "请选择模型" "a" model_choice
				case "$model_choice" in
					a) model_name="grok-4" ;;
					b) model_name="grok-4-fast" ;;
					c) model_name="grok-3" ;;
					d) model_name="grok-3-fast" ;;
					e) model_name="grok-3-mini" ;;
					f) model_name="grok-3-mini-fast" ;;
					g) prompt_with_default "请输入模型名称" "grok-4" model_name ;;
					*) model_name="grok-4" ;;
				esac
				auth_set_apikey xai "$api_key"
				register_and_set_model "xai/${model_name}"
				echo -e "  ${GREEN}✅ xAI Grok 已配置，活跃模型: xai/${model_name}${NC}"
			fi
			;;
		10)
			echo ""
			echo -e "  ${BOLD}Groq 配置${NC}"
			echo -e "  ${YELLOW}获取 API Key: https://console.groq.com/keys${NC}"
			echo -e "  ${YELLOW}Groq 提供超快推理速度${NC}"
			echo ""
			prompt_with_default "请输入 Groq API Key" "" api_key
			if [ -n "$api_key" ]; then
				echo ""
				echo -e "  ${CYAN}可用模型:${NC}"
				echo -e "    ${CYAN}a)${NC} meta-llama/llama-4-maverick-17b-128e-instruct  — Llama 4 Maverick (推荐)"
				echo -e "    ${CYAN}b)${NC} meta-llama/llama-4-scout-17b-16e-instruct      — Llama 4 Scout"
				echo -e "    ${CYAN}c)${NC} moonshotai/kimi-k2-instruct                    — Kimi K2"
				echo -e "    ${CYAN}d)${NC} qwen/qwen3-32b                                 — 通义千问 Qwen3 32B"
				echo -e "    ${CYAN}e)${NC} llama-3.3-70b-versatile                         — Llama 3.3 70B"
				echo -e "    ${CYAN}f)${NC} llama-3.1-8b-instant                            — Llama 3.1 8B (极速)"
				echo -e "    ${CYAN}g)${NC} 手动输入模型名"
				echo ""
				prompt_with_default "请选择模型" "a" model_choice
				case "$model_choice" in
					a) model_name="meta-llama/llama-4-maverick-17b-128e-instruct" ;;
					b) model_name="meta-llama/llama-4-scout-17b-16e-instruct" ;;
					c) model_name="moonshotai/kimi-k2-instruct" ;;
					d) model_name="qwen/qwen3-32b" ;;
					e) model_name="llama-3.3-70b-versatile" ;;
					f) model_name="llama-3.1-8b-instant" ;;
					g) prompt_with_default "请输入模型名称" "meta-llama/llama-4-maverick-17b-128e-instruct" model_name ;;
					*) model_name="meta-llama/llama-4-maverick-17b-128e-instruct" ;;
				esac
				auth_set_apikey groq "$api_key"
				register_and_set_model "groq/${model_name}"
				echo -e "  ${GREEN}✅ Groq 已配置，活跃模型: groq/${model_name}${NC}"
			fi
			;;
		11)
			echo ""
			echo -e "  ${BOLD}硅基流动 SiliconFlow 配置${NC}"
			echo -e "  ${YELLOW}获取 API Key: https://cloud.siliconflow.cn/account/ak${NC}"
			echo -e "  ${YELLOW}国内推理平台，支持多种开源模型${NC}"
			echo ""
			prompt_with_default "请输入 SiliconFlow API Key" "" api_key
			if [ -n "$api_key" ]; then
				echo ""
				echo -e "  ${CYAN}可用模型:${NC}"
				echo -e "    ${CYAN}a)${NC} deepseek-ai/DeepSeek-V3      — DeepSeek V3 (推荐)"
				echo -e "    ${CYAN}b)${NC} deepseek-ai/DeepSeek-R1      — DeepSeek R1"
				echo -e "    ${CYAN}c)${NC} Qwen/Qwen3-235B-A22B        — 通义千问 Qwen3 235B"
				echo -e "    ${CYAN}d)${NC} 手动输入模型名"
				echo ""
				prompt_with_default "请选择模型" "a" model_choice
				case "$model_choice" in
					a) model_name="deepseek-ai/DeepSeek-V3" ;;
					b) model_name="deepseek-ai/DeepSeek-R1" ;;
					c) model_name="Qwen/Qwen3-235B-A22B" ;;
					d) prompt_with_default "请输入模型名称" "deepseek-ai/DeepSeek-V3" model_name ;;
					*) model_name="deepseek-ai/DeepSeek-V3" ;;
				esac
				auth_set_apikey siliconflow "$api_key"
				register_custom_provider siliconflow "https://api.siliconflow.cn/v1" "$api_key" "$model_name" "$model_name"
				register_and_set_model "siliconflow/${model_name}"
				echo -e "  ${GREEN}✅ SiliconFlow 已配置，活跃模型: siliconflow/${model_name}${NC}"
			fi
			;;
		12)
			echo ""
			echo -e "  ${BOLD}🦙 Ollama 本地模型配置${NC}"
			echo -e "  ${YELLOW}Ollama 在本地或局域网运行大模型，无需 API Key${NC}"
			echo -e "  ${YELLOW}安装 Ollama: https://ollama.com${NC}"
			echo ""
			echo -e "  ${CYAN}连接方式:${NC}"
			echo -e "    ${CYAN}a)${NC} 本机运行 (localhost:11434)"
			echo -e "    ${CYAN}b)${NC} 局域网其他设备"
			echo ""
			prompt_with_default "请选择" "a" ollama_mode
			local ollama_url=""
			case "$ollama_mode" in
				b)
					prompt_with_default "Ollama 地址 (如 192.168.1.100:11434)" "" ollama_host
					if [ -n "$ollama_host" ]; then
						# 补全协议前缀
						case "$ollama_host" in
							http://*|https://*) ollama_url="${ollama_host}" ;;
							*) ollama_url="http://${ollama_host}" ;;
						esac
						# v2026.3.2: Ollama 使用原生 API，baseUrl 不带 /v1
						ollama_url=$(echo "$ollama_url" | sed 's|/v1/*$||;s|/*$||')
					fi
					;;
				*)
					ollama_url="http://127.0.0.1:11434"
					;;
			esac
			if [ -n "$ollama_url" ]; then
				# 检测 Ollama 是否可达
				echo ""
				echo -e "  ${CYAN}检测 Ollama 连通性...${NC}"
				local ollama_base=$(echo "$ollama_url" | sed 's|/v1$||')
				local ollama_check=$(curl -sf --connect-timeout 3 --max-time 5 "${ollama_base}/api/tags" 2>/dev/null || echo "")
				if [ -n "$ollama_check" ]; then
					echo -e "  ${GREEN}✅ Ollama 已连接${NC}"
					# 列出已安装的模型
					local model_list=$("$NODE_BIN" -e "
						try{
							const d=JSON.parse(process.argv[1]);
							(d.models||[]).forEach((m,i)=>console.log('    '+(i+1)+') '+m.name));
						}catch(e){}
					" "$ollama_check" 2>/dev/null)
					if [ -n "$model_list" ]; then
						echo -e "  ${CYAN}已安装的模型:${NC}"
						echo "$model_list"
						echo -e "    ${CYAN}m)${NC} 手动输入模型名"
						echo ""
						prompt_with_default "请选择模型" "1" ollama_sel
						if [ "$ollama_sel" = "m" ]; then
							prompt_with_default "请输入模型名称" "llama3.3" model_name
						elif echo "$ollama_sel" | grep -qE '^[0-9]+$'; then
							model_name=$("$NODE_BIN" -e "
								try{
									const d=JSON.parse(process.argv[1]);
									const m=(d.models||[])[parseInt(process.argv[2])-1];
									console.log(m?m.name:'');
								}catch(e){console.log('');}
							" "$ollama_check" "$ollama_sel" 2>/dev/null)
							if [ -z "$model_name" ]; then
								echo -e "  ${YELLOW}无效选择，使用默认模型${NC}"
								model_name="llama3.3"
							fi
						fi
					else
						echo -e "  ${YELLOW}未检测到已安装模型，请先在 Ollama 中拉取模型:${NC}"
						echo -e "  ${CYAN}  ollama pull llama3.3${NC}"
						echo ""
						prompt_with_default "请输入模型名称" "llama3.3" model_name
					fi
				else
					echo -e "  ${YELLOW}⚠️  无法连接 Ollama (${ollama_base})${NC}"
					echo -e "  ${YELLOW}   请确认 Ollama 已启动并可访问${NC}"
					echo -e "  ${CYAN}   提示: 如果 Ollama 在其他设备上，需设置 OLLAMA_HOST=0.0.0.0${NC}"
					echo ""
					prompt_with_default "仍要继续配置? (y/n)" "n" force_continue
					if ! confirm_yes "$force_continue"; then
						return
					fi
					prompt_with_default "请输入模型名称" "llama3.3" model_name
				fi
				if [ -n "$model_name" ]; then
					# Ollama 无需 API Key，使用占位符
					auth_set_apikey ollama "ollama-local" "ollama:local"
					# v2026.3.2: Ollama 使用原生 ollama API，不再走 OpenAI 兼容层
					_RCP_PROV="ollama" _RCP_URL="$ollama_url" _RCP_KEY="ollama-local" _RCP_MID="$model_name" _RCP_MNAME="$model_name" "$NODE_BIN" -e "
						const fs=require('fs');
						let d={};
						try{d=JSON.parse(fs.readFileSync('${CONFIG_FILE}','utf8'));}catch(e){}
						if(!d.models)d.models={};
						if(!d.models.providers)d.models.providers={};
						d.models.mode='merge';
						d.models.providers['ollama']={
							baseUrl:process.env._RCP_URL,
							apiKey:process.env._RCP_KEY,
							api:'ollama',
							models:[{
								id:process.env._RCP_MID,
								name:process.env._RCP_MNAME,
								reasoning:false,
								input:['text'],
								cost:{input:0,output:0,cacheRead:0,cacheWrite:0},
								contextWindow:128000,
								maxTokens:32000
							}]
						};
						fs.writeFileSync('${CONFIG_FILE}',JSON.stringify(d,null,2));
					" 2>/dev/null
					chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
					register_and_set_model "ollama/${model_name}"
					echo -e "  ${GREEN}✅ Ollama 已配置，活跃模型: ollama/${model_name}${NC}"
					echo -e "  ${CYAN}   Ollama 地址: ${ollama_url}${NC}"
				fi
			fi
			;;
		13)
			echo ""
			echo -e "  ${BOLD}腾讯云大模型 Coding Plan 套餐配置${NC}"
			echo ""
			echo -e "  ${YELLOW}订阅/管理套餐: https://hunyuan.cloud.tencent.com/#/app/subscription${NC}"
			echo -e "  ${YELLOW}获取 API Key: 在上方页面创建 Coding Plan 专属 Key (sk-sp-...)${NC}"
			echo -e "  ${DIM}文档: https://cloud.tencent.com/document/product/1772/128947${NC}"
			echo ""
			prompt_with_default "请输入 Coding Plan API Key (sk-sp-...)" "" api_key
			if [ -n "$api_key" ]; then
				echo ""
				echo -e "  ${CYAN}可用模型 (Coding Plan 套餐内):${NC}"
				echo -e "  ${CYAN}── 智能推荐 ──${NC}"
				echo -e "    ${CYAN}a)${NC} tc-code-latest        — 自动路由 (由平台选择最佳模型) ${GREEN}★ 推荐${NC}"
				echo -e "  ${CYAN}── 推理模型 ──${NC}"
				echo -e "    ${CYAN}b)${NC} hunyuan-t1            — 混元 T1 深度推理"
				echo -e "    ${CYAN}c)${NC} hunyuan-2.0-thinking  — 混元 2.0 Thinking"
				echo -e "  ${CYAN}── 旗舰模型 ──${NC}"
				echo -e "    ${CYAN}d)${NC} hunyuan-turbos        — 混元 TurboS 旗舰"
				echo -e "    ${CYAN}e)${NC} hunyuan-2.0-instruct  — 混元 2.0 Instruct"
				echo -e "  ${CYAN}── 第三方模型 ──${NC}"
				echo -e "    ${CYAN}f)${NC} glm-5                 — 智谱 GLM-5"
				echo -e "    ${CYAN}g)${NC} kimi-k2.5             — Moonshot Kimi K2.5"
				echo -e "    ${CYAN}h)${NC} minimax-m2.5          — MiniMax M2.5"
				echo -e "  ${CYAN}────────────${NC}"
				echo -e "    ${CYAN}z)${NC} 手动输入模型名"
				echo ""
				prompt_with_default "请选择默认模型" "a" model_choice
				case "$model_choice" in
					a) model_name="tc-code-latest" ;;
					b) model_name="hunyuan-t1" ;;
					c) model_name="hunyuan-2.0-thinking" ;;
					d) model_name="hunyuan-turbos" ;;
					e) model_name="hunyuan-2.0-instruct" ;;
					f) model_name="glm-5" ;;
					g) model_name="kimi-k2.5" ;;
					h) model_name="minimax-m2.5" ;;
					z) prompt_with_default "请输入模型名称" "tc-code-latest" model_name ;;
					*) model_name="tc-code-latest" ;;
				esac
				echo ""
				echo -e "  ${CYAN}正在注册腾讯云 Coding Plan 提供商 (含全部套餐模型)...${NC}"
				auth_set_apikey lkeap "$api_key"
				register_lkeap_codingplan_provider "$api_key"
				register_and_set_model "lkeap/${model_name}"
				echo -e "  ${GREEN}✅ 腾讯云 Coding Plan 已配置，活跃模型: lkeap/${model_name}${NC}"
				echo -e "  ${DIM}提示: 套餐内全部模型已注册，可随时在 WebChat 中通过 /model 切换${NC}"
			fi
			;;
		14)
			echo ""
			echo -e "  ${BOLD}自定义 OpenAI 兼容 API${NC}"
			echo -e "  ${YELLOW}支持任何兼容 OpenAI API 格式的服务商${NC}"
			echo ""
			prompt_with_default "API Base URL (如 https://api.example.com/v1)" "" base_url
			prompt_with_default "API Key" "" api_key
			prompt_with_default "模型名称" "" model_name
			if [ -n "$base_url" ] && [ -n "$api_key" ] && [ -n "$model_name" ]; then
				auth_set_apikey openai-compatible "$api_key" "openai-compatible:manual"
				register_custom_provider openai-compatible "$base_url" "$api_key" "$model_name" "$model_name"
				register_and_set_model "openai-compatible/${model_name}"
				echo -e "  ${GREEN}✅ 自定义模型已配置，活跃模型: openai-compatible/${model_name}${NC}"
			fi
			;;
		0) return ;;
	esac

	if [ "$choice" != "0" ] && [ "$choice" != "1" ]; then
		echo ""
		ask_restart
	fi
}

# ══════════════════════════════════════════════════════════════
# 设定当前活跃模型
# ══════════════════════════════════════════════════════════════
set_active_model() {
	echo ""
	echo -e "  ${BOLD}🔄 设定当前活跃模型${NC}"
	echo ""

	local current_model=$(json_get agents.defaults.model.primary)
	echo -e "  当前活跃模型: ${GREEN}${BOLD}${current_model:-未设置}${NC}"
	echo ""

	local models_json=""
	models_json=$(oc_cmd models list --json 2>/dev/null || echo "")
	local model_count=0
	if [ -n "$models_json" ]; then
		model_count=$("$NODE_BIN" -e "
			try{const d=JSON.parse(process.argv[1]);console.log((d.models||[]).length);}catch(e){console.log(0);}
		" "$models_json" 2>/dev/null || echo "0")
	fi

	if [ "$model_count" -gt 0 ] 2>/dev/null; then
		echo -e "  ${CYAN}已配置的模型:${NC}"
		echo ""
		"$NODE_BIN" -e "
			const d=JSON.parse(process.argv[1]);
			(d.models||[]).forEach((m,i)=>{
				const mark=m.key===process.argv[2]?' ← 当前活跃':'';
				const n=m.name&&m.name!==m.key?' ('+m.name+')':'';
				console.log('    '+(i+1)+') '+m.key+n+mark);
			});
		" "$models_json" "$current_model" 2>/dev/null
		echo ""
		echo -e "    ${CYAN}m)${NC} 手动输入模型 ID"
		echo -e "    ${CYAN}0)${NC} 返回"
		echo ""
		prompt_with_default "请选择" "0" model_sel

		if [ "$model_sel" = "0" ]; then
			return
		elif [ "$model_sel" = "m" ]; then
			prompt_with_default "请输入模型 ID (如 openai/gpt-4o)" "${current_model:-}" manual_model
			if [ -n "$manual_model" ]; then
				register_and_set_model "$manual_model"
				echo -e "  ${GREEN}✅ 活跃模型已设为: ${manual_model}${NC}"
				ask_restart
			fi
		elif echo "$model_sel" | grep -qE '^[0-9]+$'; then
			local selected=$("$NODE_BIN" -e "
				const d=JSON.parse(process.argv[1]);
				const m=(d.models||[])[parseInt(process.argv[2])-1];
				console.log(m?m.key:'');
			" "$models_json" "$model_sel" 2>/dev/null)
			if [ -n "$selected" ]; then
				register_and_set_model "$selected"
				echo -e "  ${GREEN}✅ 活跃模型已切换为: ${selected}${NC}"
				ask_restart
			else
				echo -e "  ${YELLOW}无效选择${NC}"
			fi
		fi
	else
		echo -e "  ${YELLOW}尚未配置任何模型。${NC}"
		echo -e "  ${YELLOW}请先通过「配置 AI 模型提供商」(菜单 2) 添加模型。${NC}"
		echo ""
		prompt_with_default "直接输入模型 ID 设置? (留空返回)" "" manual_model
		if [ -n "$manual_model" ]; then
			register_and_set_model "$manual_model"
			echo -e "  ${GREEN}✅ 活跃模型已设为: ${manual_model}${NC}"
			ask_restart
		fi
	fi
}

# ══════════════════════════════════════════════════════════════
# 配置 QQ 机器人 (通过 qqbot 插件 @tencent-connect/openclaw-qqbot)
# ══════════════════════════════════════════════════════════════
configure_qq() {
	echo ""
	echo -e "  ${BOLD}🐧 QQ 机器人配置${NC}"
	echo ""

	# 检查 qqbot 插件是否已安装并正常加载
	local plugin_installed=0
	local plugin_blocked=0
	local qqbot_ext_dir="${OC_STATE_DIR}/extensions/openclaw-qqbot"
	if [ -n "$OC_ENTRY" ] && [ -x "$NODE_BIN" ]; then
		local plugin_list=$(oc_cmd plugins list 2>&1)
		# 在表格输出中查找含 qqbot 的行是否也包含 loaded
		if echo "$plugin_list" | grep -i "qqbot" | grep -qi "loaded"; then
			plugin_installed=1
			echo -e "  ${GREEN}✅ qqbot 插件已安装并加载${NC}"
		elif echo "$plugin_list" | grep -qi "plugin not found.*openclaw-qqbot\|suspicious ownership"; then
			# 插件目录存在但被阻止 (权限问题或 stale config)
			if [ -d "$qqbot_ext_dir" ]; then
				plugin_blocked=1
				echo -e "  ${YELLOW}⚠️  qqbot 插件已安装但未能正常加载${NC}"
				echo -e "  ${CYAN}正在修复插件目录权限...${NC}"
				chown -R root:root "$qqbot_ext_dir" 2>/dev/null
				echo -e "  ${GREEN}✅ 权限已修复，重启 Gateway 后生效${NC}"
				plugin_installed=1
			fi
		elif [ -d "$qqbot_ext_dir" ] && [ -f "${qqbot_ext_dir}/openclaw.plugin.json" ]; then
			# 目录存在、有 plugin.json 但未出现在插件列表 — 修复权限
			echo -e "  ${YELLOW}⚠️  qqbot 插件目录存在但未能加载${NC}"
			echo -e "  ${CYAN}正在修复插件目录权限...${NC}"
			chown -R root:root "$qqbot_ext_dir" 2>/dev/null
			echo -e "  ${GREEN}✅ 权限已修复${NC}"
			plugin_installed=1
		fi
	fi

	if [ "$plugin_installed" -eq 0 ]; then
		echo -e "  ${YELLOW}⚠️  qqbot 插件尚未安装${NC}"
		echo -e "  QQ 渠道需要先安装 qqbot 插件才能使用。"
		echo ""
		prompt_with_default "是否立即安装 qqbot 插件? (y/n)" "y" install_qqbot
		if confirm_yes "$install_qqbot"; then
			echo -e "  ${CYAN}正在安装 @tencent-connect/openclaw-qqbot ...${NC}"
			echo -e "  ${DIM}(首次安装可能需要几分钟)${NC}"
			local install_out
			install_out=$(oc_cmd plugins install @tencent-connect/openclaw-qqbot@latest 2>&1)
			local install_rc=$?

			# 关键: 安装后立即修复插件目录权限为 root (OpenClaw 安全策略要求)
			if [ -d "$qqbot_ext_dir" ]; then
				chown -R root:root "$qqbot_ext_dir" 2>/dev/null
			fi

			if [ $install_rc -eq 0 ]; then
				echo -e "  ${GREEN}✅ qqbot 插件安装成功${NC}"
				plugin_installed=1
			else
				# 安装命令返回非零，可能是因为 config invalid (死锁)
				# 检查插件目录是否实际已存在 (说明下载成功但校验报错)
				if [ -d "$qqbot_ext_dir" ] && [ -f "${qqbot_ext_dir}/openclaw.plugin.json" ]; then
					echo -e "  ${YELLOW}⚠️  插件已下载但加载校验未通过 (exit: $install_rc)${NC}"
					echo -e "  ${CYAN}这通常是因为配置中已有 qqbot 设置但插件未被信任。${NC}"
					echo -e "  ${CYAN}已自动修复权限，重启 Gateway 后应能正常加载。${NC}"
					plugin_installed=1
				else
					echo -e "  ${RED}❌ 插件安装失败 (exit: $install_rc)${NC}"
					echo -e "  ${DIM}${install_out}${NC}" | tail -5
					echo ""
					echo -e "  ${YELLOW}插件安装失败，但你仍然可以先配置 QQ 机器人参数。${NC}"
					echo -e "  ${YELLOW}稍后可手动安装: openclaw plugins install @tencent-connect/openclaw-qqbot@latest${NC}"
				fi
				echo ""
			fi
			
			# v2026.3.13: 确保插件名称正确写入 plugins.allow
			# OpenClaw 要求 plugins.allow 中的名称必须与实际插件名完全匹配
			if [ "$plugin_installed" -eq 1 ]; then
				ensure_qqbot_plugin_allowed
			fi
		else
			echo -e "  ${YELLOW}已跳过插件安装，继续配置 QQ 机器人参数。${NC}"
			echo -e "  ${CYAN}稍后安装命令: openclaw plugins install @tencent-connect/openclaw-qqbot@latest${NC}"
			echo ""
		fi
	fi

	echo ""
	echo -e "  ${YELLOW}获取 App ID 和 App Secret 步骤:${NC}"
	echo -e "  1. 前往 ${CYAN}QQ 开放平台${NC}: ${CYAN}https://q.qq.com/qqbot/openclaw/login.html${NC}"
	echo -e "  2. 用手机 QQ 扫码注册/登录"
	echo -e "  3. 进入 QQ 机器人页面 → 点击「创建机器人」"
	echo -e "  4. 创建完成后，复制页面中的 ${CYAN}App ID${NC} 和 ${CYAN}App Secret${NC}"
	echo ""
	echo -e "  ${RED}⚠️  注意: App Secret 不支持二次查看（会强制重置），请妥善保存！${NC}"
	echo ""

	local current_appid=$(json_get channels.qqbot.appId)
	if [ -n "$current_appid" ]; then
		echo -e "  ${GREEN}当前已配置 App ID: ${current_appid}${NC}"
	fi

	prompt_with_default "请输入 QQ 机器人 App ID" "" qq_appid
	prompt_with_default "请输入 QQ 机器人 App Secret" "" qq_secret
	qq_appid=$(sanitize_input "$qq_appid" | tr -d '[:space:]')
	qq_secret=$(sanitize_input "$qq_secret" | tr -d '[:space:]')

	if [ -n "$qq_appid" ] && [ -n "$qq_secret" ]; then
		# App ID 应为纯数字
		if ! printf '%s' "$qq_appid" | grep -qE '^[0-9]+$'; then
			echo -e "  ${RED}❌ App ID 格式错误，应为纯数字${NC}"
			return
		fi

		# App Secret 基本格式检查 (非空即可，长度通常 32 位)
		if [ ${#qq_secret} -lt 10 ]; then
			echo -e "  ${YELLOW}⚠️  App Secret 长度过短（${#qq_secret} 字符），请确认是否完整粘贴。${NC}"
			prompt_with_default "是否仍然保存? (y/n)" "n" force_save
			if ! confirm_yes "$force_save"; then
				echo -e "  ${YELLOW}已取消，配置未保存。${NC}"
				return
			fi
		fi

		# 使用 openclaw CLI 一键配置 (推荐方式)
		echo -e "  ${CYAN}正在配置 qqbot 渠道...${NC}"
		local add_out
		add_out=$(oc_cmd channels add --channel qqbot --token "${qq_appid}:${qq_secret}" 2>&1)
		local add_rc=$?

		if [ $add_rc -ne 0 ]; then
			echo -e "  ${YELLOW}CLI 配置未成功，尝试直接写入配置文件...${NC}"
			# 回退: 直接写入 JSON 配置
			json_set channels.qqbot.enabled true
			json_set channels.qqbot.appId "$qq_appid"
			json_set channels.qqbot.clientSecret "$qq_secret"
			chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
		fi

		# 保存后验证
		local saved_appid=$(json_get channels.qqbot.appId)
		if [ -z "$saved_appid" ]; then
			echo -e "  ${RED}❌ 配置保存异常! 请检查配置文件${NC}"
			return
		fi

		echo -e "  ${GREEN}✅ QQ 机器人配置已保存${NC}"
		echo -e "  ${CYAN}   App ID: ${qq_appid}${NC}"
		echo ""
		echo -e "  ${YELLOW}提示:${NC}"
		echo -e "  • 配置完成后需重启 Gateway 使配置生效"
		echo -e "  • 如果机器人回复「该机器人去火星了」，请检查 App ID 和 App Secret 是否正确"
		echo -e "  • 当前不建议将 QQ 机器人添加进 QQ 群聊"
		echo -e "  • 插件升级: ${CYAN}openclaw plugins update openclaw-qqbot${NC}"
		echo ""

		# 重启 Gateway 使配置生效
		ask_restart
	else
		echo -e "  ${YELLOW}信息不完整，已取消。${NC}"
	fi
}

# ══════════════════════════════════════════════════════════════
# 配置 Telegram
# ══════════════════════════════════════════════════════════════
configure_telegram() {
	echo ""
	echo -e "  ${BOLD}📱 Telegram Bot 配置${NC}"
	echo ""
	echo -e "  ${YELLOW}获取 Bot Token 步骤:${NC}"
	echo -e "  1. 打开 Telegram → 搜索 ${CYAN}@BotFather${NC}"
	echo -e "  2. 发送 ${CYAN}/newbot${NC} → 按提示创建"
	echo -e "  3. 复制生成的 Token"
	echo ""

	local current_token=$(json_get channels.telegram.botToken)
	if [ -n "$current_token" ]; then
		local ct_short=$(echo "$current_token" | cut -c1-12)
		echo -e "  ${GREEN}当前已配置 Token: ${ct_short}...${NC}"
	fi

	prompt_with_default "请输入 Telegram Bot Token" "" tg_token

	if [ -n "$tg_token" ]; then
		# ── 强力清洗: 先用 sanitize_input 去除 ANSI 转义序列，再白名单过滤 ──
		tg_token=$(sanitize_input "$tg_token")
		tg_token=$(printf '%s' "$tg_token" | tr -cd 'A-Za-z0-9:_-')

		# ── 格式验证: 使用 grep 正则匹配 "数字:字母数字" ──
		if ! printf '%s' "$tg_token" | grep -qE '^[0-9]+:[A-Za-z0-9_-]+$'; then
			echo -e "  ${RED}❌ Token 格式错误${NC}"
			echo -e "  ${YELLOW}   正确格式: 123456789:ABCdefGHIjklMNOpqr${NC}"
			echo -e "  ${YELLOW}   请检查粘贴是否完整，重试。${NC}"
			return
		fi

		echo -e "  ${CYAN}验证 Token...${NC}"
		local verify=""
		verify=$(curl -s --connect-timeout 5 --max-time 10 "https://api.telegram.org/bot${tg_token}/getMe" 2>/dev/null || echo '{"ok":false}')
		if echo "$verify" | grep -q '"ok":true'; then
			local bot_name=$(echo "$verify" | grep -o '"username":"[^"]*"' | head -1 | cut -d'"' -f4)
			echo -e "  ${GREEN}✅ Token 验证成功 — @${bot_name}${NC}"
		else
			echo -e "  ${RED}❌ Token 验证失败${NC}"
			echo -e "  ${YELLOW}   可能原因: Token 不正确 或 无法连接 Telegram API${NC}"
			prompt_with_default "是否仍然保存此 Token? (y/n)" "n" force_save
			if ! confirm_yes "$force_save"; then
				echo -e "  ${YELLOW}已取消，Token 未保存。${NC}"
				return
			fi
		fi

		# ── 使用 json_set 直接写入 (避免 oc_cmd CLI 参数解析问题) ──
		json_set channels.telegram.botToken "$tg_token"
		chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
		chown openclaw:openclaw "${CONFIG_FILE}.bak" 2>/dev/null || true

		# ── 保存后验证: 读回检查 Token 是否完整 ──
		local saved_token=$(json_get channels.telegram.botToken)
		if [ "$saved_token" != "$tg_token" ]; then
			echo -e "  ${RED}❌ Token 保存异常! 已保存的值与输入不一致${NC}"
			echo -e "  ${YELLOW}   期望: ${tg_token}${NC}"
			echo -e "  ${YELLOW}   实际: ${saved_token}${NC}"
			echo -e "  ${YELLOW}   请重新配置。${NC}"
			return
		fi
		echo -e "  ${GREEN}✅ Telegram Bot Token 已保存${NC}"

		# 重启 Gateway 使 Token 生效 (必须重启，否则 Bot 无法连接 Telegram)
		echo -e "  ${CYAN}正在重启 Gateway 使 Token 生效...${NC}"
		restart_gateway

		# Token 保存且 Gateway 重启后，自动进入配对流程
		echo ""
		echo -e "  ${CYAN}接下来进行 Telegram 配对，让 Bot 关联您的账号。${NC}"
		prompt_with_default "是否现在进行配对? (y/n)" "y" do_pair
		if confirm_yes "$do_pair"; then
			telegram_pairing
		fi
	else
		echo -e "  ${YELLOW}未输入 Token，已取消。${NC}"
	fi
}

# ── 配置 Discord ──
configure_discord() {
	echo ""
	echo -e "  ${BOLD}🎮 Discord Bot 配置${NC}"
	echo ""
	echo -e "  ${YELLOW}获取 Bot Token:${NC} ${CYAN}https://discord.com/developers/applications${NC}"
	echo ""
	prompt_with_default "请输入 Discord Bot Token" "" dc_token
	dc_token=$(sanitize_input "$dc_token" | tr -d '[:space:]')
	if [ -n "$dc_token" ]; then
		json_set channels.discord.botToken "$dc_token"
		chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
		echo -e "  ${GREEN}✅ Discord Bot Token 已保存${NC}"
		ask_restart
	fi
}

# ── 配置飞书 ──
configure_feishu() {
	echo ""
	echo -e "  ${BOLD}🐦 飞书 Bot 配置${NC}"
	echo ""

	# 检查 Node.js 是否可用
	if [ ! -x "$NODE_BIN" ]; then
		echo -e "  ${RED}❌ Node.js 不可用，请先安装运行环境${NC}"
		return 1
	fi

	# 检查并安装 Python 3 (飞书插件依赖)
	if ! command -v python3 >/dev/null 2>&1; then
		echo -e "  ${YELLOW}⚠️  飞书插件需要 Python 3 支持${NC}"
		echo -e "  ${CYAN}正在尝试安装 python3-light...${NC}"
		opkg update >/dev/null 2>&1
		# 使用 python3-light 减少安装体积 (约 2MB vs 完整版 30MB+)
		opkg install python3-light 2>&1 | tail -5 || true
		if command -v python3 >/dev/null 2>&1; then
			echo -e "  ${GREEN}✅ Python 3 安装成功${NC}"
		else
			echo -e "  ${RED}❌ Python 3 安装失败${NC}"
			echo -e "  ${YELLOW}请手动安装: opkg install python3-light${NC}"
			echo ""
			prompt_with_default "是否继续尝试安装飞书? (y/n)" "n" continue_install
			if ! confirm_yes "$continue_install"; then
				return 1
			fi
		fi
	fi

	echo -e "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	echo -e "  ${CYAN}飞书官方安装向导${NC}"
	echo -e "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
	echo ""
	echo -e "  ${YELLOW}即将执行飞书官方安装命令:${NC}"
	echo -e "  ${CYAN}npx -y @larksuite/openclaw-lark-tools install${NC}"
	echo ""
	echo -e "  ${DIM}安装过程中可以:${NC}"
	echo -e "  ${DIM}  • 新建机器人: 扫描二维码一键创建${NC}"
	echo -e "  ${DIM}  • 关联已有机器人: 输入 App ID 和 App Secret${NC}"
	echo ""
	echo -e "  ${YELLOW}提示: 若命令行出错，可在命令前增加 sudo 重新执行${NC}"
	echo ""

	prompt_with_default "是否开始安装? (y/n)" "y" do_install
	if ! confirm_yes "$do_install"; then
		echo -e "  ${YELLOW}已取消安装${NC}"
		return
	fi

	echo ""
	echo -e "  ${CYAN}正在启动飞书安装向导...${NC}"
	echo ""

	# 执行官方安装命令
	cd "$OC_DATA"
	NPX_BIN="${NODE_BASE}/bin/npx"
	local install_rc=0
	if [ -x "$NPX_BIN" ]; then
		"$NPX_BIN" -y @larksuite/openclaw-lark-tools install || install_rc=$?
	else
		# 如果 npx 不存在，使用 node 运行
		"$NODE_BIN" "$NODE_BASE/lib/node_modules/npm/bin/npx-cli.js" -y @larksuite/openclaw-lark-tools install || install_rc=$?
	fi

	echo ""
	if [ $install_rc -eq 0 ]; then
		echo -e "  ${GREEN}✅ 飞书安装完成！${NC}"
		echo ""
		echo -e "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
		echo -e "  ${YELLOW}下一步:${NC}"
		echo -e "  ${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
		echo ""
		echo -e "  1. 在飞书中向机器人发送任意消息，即可开始对话"
		echo -e "  2. 发送 ${CYAN}/feishu auth${NC} 完成批量授权"
		echo -e "  3. 发送 ${CYAN}/feishu start${NC} 验证安装是否成功"
		echo -e "  4. 发送 ${CYAN}学习一下我安装的新飞书插件，列出有哪些能力${NC}"
		echo ""
	else
		echo -e "  ${YELLOW}⚠️ 安装向导退出 (exit: $install_rc)${NC}"
		echo ""
		echo -e "  ${CYAN}手动安装命令:${NC}"
		echo -e "  ${CYAN}npx -y @larksuite/openclaw-lark-tools install${NC}"
		echo ""
	fi
}

# ── 配置 Slack ──
configure_slack() {
	echo ""
	echo -e "  ${BOLD}💬 Slack Bot 配置${NC}"
	echo ""
	echo -e "  ${YELLOW}获取 Bot Token:${NC} ${CYAN}https://api.slack.com/apps${NC} → Create App"
	echo ""
	prompt_with_default "请输入 Slack Bot Token (xoxb-...)" "" sk_token
	sk_token=$(sanitize_input "$sk_token" | tr -d '[:space:]')
	if [ -n "$sk_token" ]; then
		json_set channels.slack.botToken "$sk_token"
		chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
		echo -e "  ${GREEN}✅ Slack Bot Token 已保存${NC}"
		ask_restart
	fi
}

# ══════════════════════════════════════════════════════════════
# Telegram 配对助手
# ══════════════════════════════════════════════════════════════
telegram_pairing() {
	echo ""
	echo -e "  ${BOLD}🤝 Telegram 配对助手${NC}"
	echo ""

	local tg_token=$(json_get channels.telegram.botToken)
	if [ -z "$tg_token" ]; then
		echo -e "  ${YELLOW}未检测到 Telegram Bot Token，请先配置 Telegram。${NC}"
		return
	fi

	echo -e "  ${CYAN}诊断 Telegram API 连通性...${NC}"
	local verify=""
	verify=$(curl -s --connect-timeout 5 --max-time 10 "https://api.telegram.org/bot${tg_token}/getMe" 2>/dev/null || echo '{"ok":false}')
	if echo "$verify" | grep -q '"ok":true'; then
		local bot_name=$(echo "$verify" | grep -o '"username":"[^"]*"' | head -1 | cut -d'"' -f4)
		echo -e "  ${GREEN}✅ Telegram API 连通正常 — @${bot_name}${NC}"
	else
		echo -e "  ${RED}❌ Telegram API 连通检测未通过${NC}"
		echo -e "  ${YELLOW}   可能原因: Token 不正确、网络不通 或 Telegram 被屏蔽${NC}"
		echo -e "  ${CYAN}   建议: 返回重新配置 Token 或检查代理/网络设置${NC}"
		return
	fi

	echo ""
	echo -e "  ${GREEN}╔══════════════════════════════════════════════════╗${NC}"
	echo -e "  ${GREEN}║  请在 Telegram 中向 Bot 发送 /start              ║${NC}"
	echo -e "  ${GREEN}║  然后回到这里按回车，脚本自动检测配对请求        ║${NC}"
	echo -e "  ${GREEN}╚══════════════════════════════════════════════════╝${NC}"
	echo ""
	echo -e "  ${YELLOW}发送 /start 后按回车继续 (输入 q 退出)...${NC}"
	read _wait
	case "$_wait" in q|Q) return ;; esac

	local paired=0
	local attempt=1
	while [ $attempt -le 3 ]; do
		echo -e "  ${CYAN}检测配对请求... (第 ${attempt}/3 轮)${NC}"
		local pair_json=$(oc_cmd pairing list telegram --json 2>/dev/null || echo "")
		local codes=""
		if [ -n "$pair_json" ]; then
			codes=$(echo "$pair_json" | grep -o '"code"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
		fi

		if [ -n "$codes" ]; then
			# 逐个处理配对码 (避免管道子 shell 变量丢失问题)
			local _codes_tmp="/tmp/oc_pair_codes_$$"
			echo "$codes" > "$_codes_tmp"
			while IFS= read -r code; do
				[ -z "$code" ] && continue
				echo -e "  ${CYAN}发现配对请求: ${code}${NC}"
				local approve=$(oc_cmd pairing approve telegram "$code" 2>&1)
				if echo "$approve" | grep -qi "approved\|success\|ok"; then
					echo ""
					echo -e "  ${GREEN}${BOLD}🎉 Telegram 配对成功！${NC}"
				fi
			done < "$_codes_tmp"
			rm -f "$_codes_tmp"
			# 检查是否还有待配对的
			local re_check=$(oc_cmd pairing list telegram --json 2>/dev/null || echo "")
			local re_codes=$(echo "$re_check" | grep -o '"code"[[:space:]]*:[[:space:]]*"[^"]*"' | cut -d'"' -f4)
			if [ -z "$re_codes" ]; then
				paired=1
				break
			fi
		fi

		if [ $attempt -lt 3 ] && [ $paired -eq 0 ]; then
			echo -e "  ${YELLOW}未检测到，等待 8 秒后重试...${NC}"
			sleep 8
		fi
		attempt=$((attempt + 1))
	done

	if [ "$paired" -eq 0 ]; then
		echo ""
		echo -e "  ${YELLOW}未自动检测到配对请求。${NC}"
		echo -e "  ${CYAN}如果 Bot 已回复配对码，请手动输入 (回车跳过):${NC}"
		prompt_with_default "配对码" "" manual_code
		if [ -n "$manual_code" ]; then
			local approve=$(oc_cmd pairing approve telegram "$manual_code" 2>&1)
			if echo "$approve" | grep -qi "approved\|success\|ok"; then
				echo -e "  ${GREEN}${BOLD}🎉 Telegram 配对成功！${NC}"
				paired=1
			else
				echo -e "  ${YELLOW}配对失败: $approve${NC}"
			fi
		fi
	fi

	# 配对成功后重启网关，使配对关系立即生效
	if [ "$paired" -eq 1 ]; then
		echo ""
		echo -e "  ${CYAN}正在重启 Gateway 使配对生效...${NC}"
		restart_gateway
		echo -e "  ${GREEN}✅ 现在可以在 Telegram 中与 Bot 对话了！${NC}"
	fi
}

# ══════════════════════════════════════════════════════════════
# 配置渠道子菜单
# ══════════════════════════════════════════════════════════════
configure_channels() {
	while true; do
		echo ""
		echo -e "  ${BOLD}📡 配置消息渠道${NC}"
		echo ""
		echo -e "  ${CYAN}1)${NC} QQ 机器人  ${GREEN}(腾讯QQ，推荐国内用户)${NC}"
		echo -e "  ${CYAN}2)${NC} Telegram  ${GREEN}(最常用，推荐)${NC}"
		echo -e "  ${CYAN}3)${NC} Discord"
		echo -e "  ${CYAN}4)${NC} 飞书 (Feishu)"
		echo -e "  ${CYAN}5)${NC} Slack"
		echo -e "  ${CYAN}6)${NC} WhatsApp  ${YELLOW}(需通过 Web 控制台扫码)${NC}"
		echo -e "  ${CYAN}7)${NC} Telegram 配对助手"
		echo -e "  ${CYAN}8)${NC} 官方完整渠道配置向导"
		echo -e "  ${CYAN}0)${NC} 返回主菜单"
		echo ""
		prompt_with_default "请选择" "1" ch_choice

		case "$ch_choice" in
			1) configure_qq ;;
			2) configure_telegram ;;
			3) configure_discord ;;
			4) configure_feishu ;;
			5) configure_slack ;;
			6)
				echo ""
				echo -e "  ${YELLOW}WhatsApp 需要通过 Web 控制台扫码配对:${NC}"
				local gw_token=$(json_get gateway.auth.token)
				local gw_port=$(json_get gateway.port)
				gw_port=${gw_port:-18789}
				echo -e "  ${CYAN}http://<你的路由器IP>:${gw_port}/?token=${gw_token}${NC}"
				echo -e "  打开后进入 Channels → WhatsApp 扫码即可。"
				;;
			7) telegram_pairing ;;
			8)
				echo ""
				echo -e "  ${CYAN}启动官方渠道配置向导...${NC}"
				(oc_cmd configure --section channels) || echo -e "  ${YELLOW}配置向导已退出${NC}"
				;;
			0) return ;;
			*) echo -e "  ${YELLOW}无效选择${NC}" ;;
		esac
	done
}

# ══════════════════════════════════════════════════════════════
# 健康检查
# ══════════════════════════════════════════════════════════════
health_check() {
	echo ""
	echo -e "  ${BOLD}🔍 健康检查${NC}"
	echo ""

	local gw_port=$(json_get gateway.port)
	gw_port=${gw_port:-18789}

	# ── v2026.3.2: 使用官方 config validate 验证配置 ──
	if command -v openclaw >/dev/null 2>&1 || [ -n "$OC_ENTRY" ]; then
		echo -e "  ${CYAN}验证配置文件格式...${NC}"
		local validate_out=""
		validate_out=$(oc_cmd config validate --json 2>/dev/null) || true
		if [ -n "$validate_out" ]; then
			local has_errors=$("$NODE_BIN" -e "
				try{const r=JSON.parse(process.argv[1]);
				if(r.valid===true){console.log('OK');}
				else if(r.errors&&r.errors.length>0){r.errors.forEach(e=>console.log('ERR:'+e.message));}
				else{console.log('OK');}}catch(e){console.log('SKIP');}
			" "$validate_out" 2>/dev/null)
			if [ "$has_errors" = "OK" ]; then
				echo -e "  ${GREEN}✅ 配置文件格式有效${NC}"
			elif [ "$has_errors" = "SKIP" ]; then
				echo -e "  ${YELLOW}⚠️  无法解析验证结果，跳过${NC}"
			else
				echo -e "  ${RED}❌ 配置文件存在错误:${NC}"
				echo "$has_errors" | while IFS= read -r line; do
					echo -e "     ${YELLOW}• ${line#ERR:}${NC}"
				done
			fi
		else
			echo -e "  ${YELLOW}⚠️  config validate 不可用，跳过格式验证${NC}"
		fi
		echo ""
	fi

	# ── 自动修复: 移除旧版错误写入的顶层 models.xxx 无效键 ──
	if [ -f "$CONFIG_FILE" ]; then
		local has_bad_models=$("$NODE_BIN" -e "
			const d=JSON.parse(require('fs').readFileSync('${CONFIG_FILE}','utf8'));
			const m=d.models;
			if(m&&typeof m==='object'){
				const bad=Object.keys(m).filter(k=>['openai','anthropic','google','openrouter','deepseek','github-copilot','dashscope','xai','groq','siliconflow','custom'].includes(k));
				if(bad.length>0){console.log(bad.join(','));}
			}
		" 2>/dev/null)
		if [ -n "$has_bad_models" ]; then
			echo -e "  ${YELLOW}⚠️  检测到旧版配置错误: 顶层 models 包含无效键 (${has_bad_models})${NC}"
			echo -e "  ${CYAN}正在自动修复...${NC}"
			"$NODE_BIN" -e "
				const fs=require('fs');
				const d=JSON.parse(fs.readFileSync('${CONFIG_FILE}','utf8'));
				const bad=['openai','anthropic','google','openrouter','deepseek','github-copilot','dashscope','xai','groq','siliconflow','custom'];
				if(d.models&&typeof d.models==='object'){
					bad.forEach(k=>delete d.models[k]);
					if(Object.keys(d.models).length===0||(Object.keys(d.models).length===1&&d.models.providers)){}
					else if(Object.keys(d.models).filter(k=>k!=='mode'&&k!=='providers').length===0){}
					if(!d.models.providers&&Object.keys(d.models).every(k=>bad.includes(k)||k==='mode'))delete d.models;
				}
				fs.writeFileSync('${CONFIG_FILE}',JSON.stringify(d,null,2));
			" 2>/dev/null
			chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
			echo -e "  ${GREEN}✅ 已移除无效的 models 配置键${NC}"
			echo ""
		fi
	fi

	if check_port_listening "$gw_port"; then
		echo -e "  ${GREEN}✅ Gateway 端口 ${gw_port} 正在监听${NC}"
	else
		echo -e "  ${RED}❌ Gateway 端口 ${gw_port} 未监听${NC}"
	fi

	local http_code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "http://127.0.0.1:${gw_port}/" 2>/dev/null || echo "000")
	if [ "$http_code" = "200" ] || [ "$http_code" = "302" ] || [ "$http_code" = "401" ]; then
		echo -e "  ${GREEN}✅ HTTP 响应正常 (${http_code})${NC}"
	else
		echo -e "  ${RED}❌ HTTP 响应异常 (${http_code})${NC}"
	fi

	# v2026.3.2: 使用 gateway health --json 做深度健康检查 (HTTP /health 已被 SPA 接管)
	local health_resp=$(oc_cmd gateway health --json 2>/dev/null)
	if [ -n "$health_resp" ]; then
		local health_ok=$("$NODE_BIN" -e "try{const h=JSON.parse(process.argv[1]);console.log(h.ok?'ok':'fail');}catch(e){console.log('parse_error');}" "$health_resp" 2>/dev/null)
		if [ "$health_ok" = "ok" ]; then
			echo -e "  ${GREEN}✅ Gateway 健康检查正常${NC}"
		elif [ "$health_ok" = "parse_error" ]; then
			echo -e "  ${YELLOW}⚠️  Gateway 健康检查响应无法解析${NC}"
		else
			echo -e "  ${YELLOW}⚠️  Gateway 健康检查异常${NC}"
		fi
	fi

	if [ -f "$CONFIG_FILE" ]; then
		echo -e "  ${GREEN}✅ 配置文件存在${NC}"
	else
		echo -e "  ${RED}❌ 配置文件不存在${NC}"
	fi

	echo ""
	echo -e "  ${CYAN}运行官方诊断...${NC}"
	oc_cmd doctor 2>/dev/null || true

	echo ""
	echo -e "  ${CYAN}最近日志 (最后 10 行):${NC}"
	logread -e openclaw 2>/dev/null | tail -10 || echo "  (无日志)"
}

# ══════════════════════════════════════════════════════════════
# 恢复默认配置
# ══════════════════════════════════════════════════════════════
reset_to_defaults() {
	echo ""
	echo -e "  ${BOLD}⚠️  恢复默认配置${NC}"
	echo ""
	echo -e "  ${YELLOW}请选择恢复级别:${NC}"
	echo ""
	echo -e "  ${CYAN}1)${NC} 🔧 仅重置网关设置 (端口/绑定/模式恢复默认，保留模型和渠道)"
	echo -e "  ${CYAN}2)${NC} 🤖 清除模型配置   (移除所有 AI 模型和 API Key)"
	echo -e "  ${CYAN}3)${NC} 📡 清除渠道配置   (移除所有消息渠道配置)"
	echo -e "  ${CYAN}4)${NC} 🔄 完全恢复出厂   (删除所有配置，重新初始化)"
	echo -e "  ${CYAN}0)${NC} 返回"
	echo ""
	prompt_with_default "请选择" "0" reset_choice

	case "$reset_choice" in
		1)
			echo ""
			echo -e "  ${YELLOW}将重置: 网关端口→18789, 绑定→lan, 模式→local${NC}"
			echo -e "  ${YELLOW}保留: 认证令牌、模型配置、消息渠道${NC}"
			prompt_with_default "确认恢复网关默认设置? (yes/no)" "no" confirm
			if [ "$confirm" = "yes" ]; then
				echo ""
				echo -e "  ${CYAN}正在重置网关设置...${NC}"
				json_set gateway.port 18789 2>&1
				json_set gateway.bind lan 2>&1
				json_set gateway.mode local 2>&1
				json_set gateway.controlUi.allowInsecureAuth true 2>&1
				json_set gateway.controlUi.dangerouslyDisableDeviceAuth true 2>&1
				json_set gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback true 2>&1
				json_set gateway.tailscale.mode off 2>&1
				echo -e "  ${GREEN}✅ 网关设置已恢复默认${NC}"
				ask_restart
			else
				echo -e "  ${CYAN}已取消${NC}"
			fi
			;;
		2)
			echo ""
			echo -e "  ${RED}⚠️  将清除: 所有模型配置、API Key、活跃模型设置${NC}"
			prompt_with_default "确认清除所有模型配置? (yes/no)" "no" confirm
			if [ "$confirm" = "yes" ]; then
				echo ""
				echo -e "  ${CYAN}正在清除模型配置...${NC}"
				oc_cmd config unset models >/dev/null 2>&1 || true
				oc_cmd config unset agents.defaults.model >/dev/null 2>&1 || true
				oc_cmd config unset agents.defaults.models >/dev/null 2>&1 || true
				# 同时清除 auth-profiles.json 中的认证信息
				local auth_file="${OC_STATE_DIR}/agents/main/agent/auth-profiles.json"
				if [ -f "$auth_file" ]; then
					echo '{"version":1,"profiles":{},"usageStats":{}}' > "$auth_file"
					chown openclaw:openclaw "$auth_file" 2>/dev/null || true
				fi
				echo -e "  ${GREEN}✅ 模型配置已清除${NC}"
				echo -e "  ${YELLOW}请通过菜单 [2] 重新配置 AI 模型${NC}"
				ask_restart
			else
				echo -e "  ${CYAN}已取消${NC}"
			fi
			;;
		3)
			echo ""
			echo -e "  ${RED}⚠️  将清除: 所有消息渠道配置 (Telegram/Discord/飞书等)${NC}"
			prompt_with_default "确认清除所有渠道配置? (yes/no)" "no" confirm
			if [ "$confirm" = "yes" ]; then
				echo ""
				echo -e "  ${CYAN}正在清除渠道配置...${NC}"
				# 清除 openclaw.json 中的 channels 配置
				oc_cmd config unset channels >/dev/null 2>&1 || true
				
				# v2026.3.14: 同时清除 plugins 中与渠道相关的配置
				# 防止重置后插件配置残留导致状态不一致
				if [ -f "$CONFIG_FILE" ] && [ -x "$NODE_BIN" ]; then
					"$NODE_BIN" -e "
						const fs=require('fs');
						try{
							const d=JSON.parse(fs.readFileSync('${CONFIG_FILE}','utf8'));
							let modified=false;
							
							// 清除 plugins.entries 中与消息渠道相关的插件
							if(d.plugins && d.plugins.entries){
								const channelPlugins=['openclaw-qqbot','@tencent-connect/openclaw-qqbot','openclaw-lark','@larksuite/openclaw-lark'];
								channelPlugins.forEach(p=>{
									if(d.plugins.entries[p]){
										delete d.plugins.entries[p];
										modified=true;
									}
								});
							}
							
							// 清除 plugins.allow 中的渠道插件
							if(Array.isArray(d.plugins && d.plugins.allow)){
								const beforeLen=d.plugins.allow.length;
								d.plugins.allow=d.plugins.allow.filter(p=>
									!p.includes('qqbot') && 
									!p.includes('lark') && 
									!p.includes('telegram') &&
									!p.includes('discord') &&
									!p.includes('slack') &&
									!p.includes('whatsapp')
								);
								if(d.plugins.allow.length!==beforeLen)modified=true;
							}
							
							if(modified){
								fs.writeFileSync('${CONFIG_FILE}',JSON.stringify(d,null,2));
								console.log('CLEANED');
							}
						}catch(e){}
					" 2>/dev/null
					chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
				fi
				
				# 清除飞书扩展目录中的敏感数据 (保留插件本体)
				local feishu_ext_dir="${OC_STATE_DIR}/extensions/openclaw-lark"
				if [ -d "$feishu_ext_dir" ]; then
					# 只清除配置文件，保留插件代码
					rm -f "${feishu_ext_dir}/.credentials"* 2>/dev/null
					rm -f "${feishu_ext_dir}/config.json" 2>/dev/null
					rm -rf "${feishu_ext_dir}/.cache" 2>/dev/null
					echo -e "  ${CYAN}已清理飞书插件缓存数据${NC}"
				fi
				
				# 清除 QQ 机器人扩展目录中的敏感数据
				local qqbot_ext_dir="${OC_STATE_DIR}/extensions/openclaw-qqbot"
				if [ -d "$qqbot_ext_dir" ]; then
					rm -f "${qqbot_ext_dir}/credentials"* 2>/dev/null
					rm -f "${qqbot_ext_dir}/config.json" 2>/dev/null
				fi
				
				echo -e "  ${GREEN}✅ 渠道配置已清除${NC}"
				echo -e "  ${YELLOW}请通过菜单 [4] 重新配置消息渠道${NC}"
				ask_restart
			else
				echo -e "  ${CYAN}已取消${NC}"
			fi
			;;
		4)
			echo ""
			echo -e "  ${RED}╔══════════════════════════════════════════════════════╗${NC}"
			echo -e "  ${RED}║  ⚠️  完全恢复出厂设置                               ║${NC}"
			echo -e "  ${RED}║  此操作将删除所有配置并重新初始化                    ║${NC}"
			echo -e "  ${RED}╚══════════════════════════════════════════════════════╝${NC}"
			echo ""
			echo -e "  ${RED}此操作不可撤销！${NC}"
			prompt_with_default "输入 RESET 确认恢复出厂设置" "" confirm
			if [ "$confirm" = "RESET" ]; then
				echo ""
				echo -e "  ${CYAN}[1/5] 停止 Gateway...${NC}"
				# 只停止 gateway 实例, 不能停 pty (否则会断开当前终端连接)
				local gw_pid=""
				gw_pid=$(ubus call service list '{"name":"openclaw"}' 2>/dev/null | jsonfilter -e '$.openclaw.instances.gateway.pid' 2>/dev/null) || true
				if [ -n "$gw_pid" ] && kill -0 "$gw_pid" 2>/dev/null; then
					kill "$gw_pid" 2>/dev/null || true
					sleep 2
				else
					# 按端口查找 gateway 进程
					local gw_port_cur=$(json_get gateway.port)
					gw_port_cur=${gw_port_cur:-18789}
					local gw_pid2=$(get_pid_by_port "$gw_port_cur")
					if [ -n "$gw_pid2" ]; then
						kill "$gw_pid2" 2>/dev/null || true
						sleep 2
					fi
				fi
				echo -e "  ${GREEN}   Gateway 已停止${NC}"

				echo -e "  ${CYAN}[2/5] 备份当前配置...${NC}"
				local backup_dir="${OC_STATE_DIR}/backups"
				local backup_ts=$(date +%Y%m%d_%H%M%S)
				mkdir -p "$backup_dir"
				chown openclaw:openclaw "$backup_dir" 2>/dev/null || true
				if [ -f "$CONFIG_FILE" ]; then
					cp "$CONFIG_FILE" "${backup_dir}/openclaw_${backup_ts}.json"
					echo -e "  ${GREEN}   备份已保存: backups/openclaw_${backup_ts}.json${NC}"
				fi

				echo -e "  ${CYAN}[3/5] 重置配置...${NC}"
				# 直接删除配置文件 (避免 oc_cmd reset 可能的交互式阻塞)
				rm -f "$CONFIG_FILE" 2>/dev/null || true
				rm -f "${CONFIG_FILE}.bak" 2>/dev/null || true
				echo '{}' > "$CONFIG_FILE"
				chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
				echo -e "  ${GREEN}   配置已清除${NC}"

				echo -e "  ${CYAN}[4/5] 重新初始化...${NC}"
				# 尝试 onboard，超时 10 秒避免阻塞
				local _node_bin
				_node_bin=$(which node 2>/dev/null || echo "$NODE_BIN")
				if command -v timeout >/dev/null 2>&1; then
					timeout 10 sh -c "\"$_node_bin\" \"$OC_ENTRY\" onboard --non-interactive --accept-risk --tools-profile coding" >/dev/null 2>&1 || true
				else
					"$_node_bin" "$OC_ENTRY" onboard --non-interactive --accept-risk --tools-profile coding >/dev/null 2>&1 &
					local _ob_pid=$!
					sleep 10
					kill "$_ob_pid" 2>/dev/null || true
					wait "$_ob_pid" 2>/dev/null || true
				fi
				echo -e "  ${GREEN}   初始化完成${NC}"

				echo -e "  ${CYAN}[5/5] 应用 OpenWrt 适配配置...${NC}"
				local new_token
				new_token=$(head -c 24 /dev/urandom | hexdump -e '24/1 "%02x"' 2>/dev/null || dd if=/dev/urandom bs=24 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n' | head -c 48)
				json_set gateway.port 18789
				json_set gateway.bind lan
				json_set gateway.mode local
				json_set gateway.auth.mode token
				json_set gateway.auth.token "$new_token"
				json_set gateway.controlUi.allowInsecureAuth true
				json_set gateway.controlUi.dangerouslyDisableDeviceAuth true
				json_set gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback true
				json_set gateway.tailscale.mode off
				json_set acp.dispatch.enabled false
				json_set tools.profile coding

				# 同步 token 到 UCI
				. /lib/functions.sh 2>/dev/null || true
				uci set openclaw.main.token="$new_token" 2>/dev/null
				uci commit openclaw 2>/dev/null

				echo ""
				echo -e "  ${GREEN}✅ 出厂设置已恢复！${NC}"
				echo ""
				echo -e "  ${CYAN}新认证令牌: ${new_token}${NC}"
				echo ""

				# 重启 gateway (通过 procd reload, 这样不会杀 pty)
				/etc/init.d/openclaw start >/dev/null 2>&1 &
				echo -e "  ${YELLOW}⏳ Gateway 启动中，请稍候...${NC}"
				local gw_port=18789
				local waited=0
				while [ $waited -lt 15 ]; do
					sleep 2
					waited=$((waited + 2))
					if check_port_listening "$gw_port"; then
						echo -e "  ${GREEN}✅ Gateway 已重新启动${NC}"
						break
					fi
				done
				if [ $waited -ge 15 ]; then
					echo -e "  ${YELLOW}⏳ Gateway 可能仍在启动中，请稍后检查${NC}"
				fi
			else
				echo -e "  ${CYAN}已取消${NC}"
			fi
			;;
		0|"") return ;;
		*) echo -e "  ${YELLOW}无效选择${NC}" ;;
	esac
}

# ══════════════════════════════════════════════════════════════
# 主菜单
# ══════════════════════════════════════════════════════════════
# ══════════════════════════════════════════════════════════════
# 备份/还原配置菜单 (v2026.3.8+ openclaw backup create/verify)
# ══════════════════════════════════════════════════════════════
backup_restore_menu() {
	echo ""
	echo -e "  ${BOLD}💾 备份/还原配置${NC}"
	echo ""
	echo -e "  ${CYAN}1)${NC} 创建配置备份 (仅配置文件)"
	echo -e "  ${CYAN}2)${NC} 创建完整备份 (配置 + 状态数据)"
	echo -e "  ${CYAN}3)${NC} 验证最新备份"
	echo -e "  ${CYAN}4)${NC} 查看备份列表"
	echo -e "  ${CYAN}5)${NC} 从最新备份恢复配置"
	echo -e "  ${CYAN}0)${NC} 返回主菜单"
	echo ""
	prompt_with_default "请选择" "1" backup_choice

	# 备份目录 (openclaw backup create 输出到 CWD)
	local backup_dir="${OC_STATE_DIR}/backups"
	mkdir -p "$backup_dir" 2>/dev/null

	case "$backup_choice" in
		1)
			echo -e "  ${CYAN}正在创建配置备份...${NC}"
			local out
			out=$(cd "$backup_dir" && oc_cmd backup create --only-config --no-include-workspace 2>&1)
			local rc=$?
			echo "$out"
			if [ $rc -eq 0 ] && echo "$out" | grep -q "\.tar\.gz"; then
				echo -e "  ${GREEN}✅ 配置备份已创建${NC}"
			else
				echo -e "  ${YELLOW}⚠️  备份功能需要 OpenClaw v2026.3.8+${NC}"
				echo -e "  ${DIM}如果备份命令不可用，可手动备份: cp ${CONFIG_FILE} ${CONFIG_FILE}.bak${NC}"
			fi
			;;
		2)
			echo -e "  ${CYAN}正在创建完整备份...${NC}"
			echo -e "  ${DIM}(包含配置和状态数据，可能需要较长时间)${NC}"
			local out
			out=$(cd "$backup_dir" && HOME="$backup_dir" oc_cmd backup create --no-include-workspace 2>&1)
			local rc=$?
			echo "$out"
			# 完整备份可能输出到 HOME，尝试移动到 backup_dir
			for f in "${OC_DATA}"/*-openclaw-backup.tar.gz; do
				[ -f "$f" ] && mv "$f" "$backup_dir/" 2>/dev/null
			done
			if [ $rc -eq 0 ] && echo "$out" | grep -q "\.tar\.gz"; then
				echo -e "  ${GREEN}✅ 完整备份已创建${NC}"
			else
				echo -e "  ${YELLOW}⚠️  备份失败${NC}"
				echo -e "  ${DIM}提示: 如果配置文件有校验警告，完整备份可能受限。请使用选项 1 (仅配置文件) 备份${NC}"
			fi
			;;
		3)
			local latest=$(ls -t "${backup_dir}"/*-openclaw-backup.tar.gz 2>/dev/null | head -1)
			if [ -z "$latest" ]; then
				# 也检查旧位置
				latest=$(ls -t "${OC_STATE_DIR}"/*-openclaw-backup.tar.gz "${OC_DATA}"/*-openclaw-backup.tar.gz 2>/dev/null | head -1)
			fi
			if [ -z "$latest" ]; then
				echo -e "  ${YELLOW}未找到备份文件，请先创建备份${NC}"
			else
				echo -e "  ${CYAN}验证备份: ${latest}${NC}"
				oc_cmd backup verify "$latest" 2>&1
			fi
			;;
		4)
			echo ""
			if [ -d "$backup_dir" ]; then
				local count=$(ls "${backup_dir}"/*-openclaw-backup.tar.gz 2>/dev/null | wc -l)
				if [ "$count" -gt 0 ] 2>/dev/null; then
					echo -e "  ${BOLD}备份文件列表:${NC}"
					ls -lh "${backup_dir}"/*-openclaw-backup.tar.gz 2>/dev/null | while read line; do
						echo -e "  ${DIM}${line}${NC}"
					done
				else
					echo -e "  ${YELLOW}暂无备份文件${NC}"
				fi
			else
				echo -e "  ${YELLOW}暂无备份文件${NC}"
			fi
			echo ""
			echo -e "  ${DIM}备份目录: ${backup_dir}${NC}"
			;;
		5)
			local latest=$(ls -t "${backup_dir}"/*-openclaw-backup.tar.gz 2>/dev/null | head -1)
			if [ -z "$latest" ]; then
				echo -e "  ${YELLOW}未找到备份文件，请先创建备份${NC}"
			else
				echo -e "  ${CYAN}将从以下备份恢复:${NC}"
				echo -e "  ${DIM}${latest}${NC}"
				echo ""
				echo -e "  ${YELLOW}⚠️  这会还原备份中的所有配置和数据文件到原路径！${NC}"
				prompt_with_default "确认恢复? (y/N)" "N" confirm_restore
				if [ "$confirm_restore" = "y" ] || [ "$confirm_restore" = "Y" ]; then
					# 验证备份中 openclaw.json 有效
					local tmp_json="/tmp/oc-restore-check.json"
					tar -xzf "$latest" --wildcards '*/openclaw.json' -O > "$tmp_json" 2>/dev/null
					if [ ! -s "$tmp_json" ] || ! "$NODE_BIN" -e "JSON.parse(require('fs').readFileSync('${tmp_json}','utf8'))" 2>/dev/null; then
						rm -f "$tmp_json"
						echo -e "  ${RED}❌ 备份中的配置文件无效，恢复已取消${NC}"
					else
						rm -f "$tmp_json"
						# 备份当前配置
						cp -f "$CONFIG_FILE" "${CONFIG_FILE}.pre-restore" 2>/dev/null
						# 获取备份名前缀
						local backup_name=$(tar -tzf "$latest" 2>/dev/null | head -1 | cut -d/ -f1)
						if [ -z "$backup_name" ]; then
							echo -e "  ${RED}❌ 备份文件格式无法识别${NC}"
						else
							echo -e "  ${DIM}正在还原文件...${NC}"
							# 停止服务
							/etc/init.d/openclaw stop >/dev/null 2>&1
							sleep 2
							# 提取 payload 到根目录 (还原到原始绝对路径)
							tar -xzf "$latest" --strip-components=3 -C / "${backup_name}/payload/posix/" 2>&1
							# 修复权限
							chown -R openclaw:openclaw /opt/openclaw/data/.openclaw 2>/dev/null
							echo -e "  ${GREEN}✅ 配置和数据已完整恢复！原配置已保存为 openclaw.json.pre-restore${NC}"
							echo ""
							prompt_with_default "是否重启服务使配置生效? (Y/n)" "Y" do_restart
							if [ "$do_restart" != "n" ] && [ "$do_restart" != "N" ]; then
								restart_gateway
							fi
						fi
					fi
				else
					echo -e "  ${DIM}已取消${NC}"
				fi
			fi
			;;
		0|"") return ;;
		*) echo -e "  ${YELLOW}无效选择${NC}" ;;
	esac
}

main_menu() {
	while true; do
		echo ""
		echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
		echo -e "${GREEN}║${NC}           ${BOLD}OpenClaw AI Gateway — OpenWrt 配置管理${NC}             ${GREEN}║${NC}"
		echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
		echo ""
		echo -e "  ${DIM}━━━ AI 模型配置 ━━━${NC}"
		echo -e "  ${CYAN}1)${NC} 🤖 配置 AI 模型和提供商"
		echo -e "  ${CYAN}2)${NC} 🎯 设置活动模型"
		echo ""
		echo -e "  ${DIM}━━━ 消息渠道 ━━━${NC}"
		echo -e "  ${CYAN}3)${NC} 📡 配置消息渠道 (电报/QQ/飞书)"
		echo ""
		echo -e "  ${DIM}━━━ 系统管理 ━━━${NC}"
		echo -e "  ${CYAN}4)${NC} 🩺 健康检查与状态"
		echo -e "  ${CYAN}5)${NC} 📋 查看日志"
		echo -e "  ${CYAN}6)${NC} 🔄 重启 Gateway"
		echo ""
		echo -e "  ${DIM}━━━ 高级选项 ━━━${NC}"
		echo -e "  ${CYAN}7)${NC} 🔧 高级配置"
		echo -e "  ${CYAN}8)${NC} ♻️ 重置配置"
		echo -e "  ${CYAN}9)${NC} 📊 显示当前配置概览"
		echo ""
		echo -e "  ${CYAN}0)${NC} 退出"
		echo ""
		prompt_with_default "请选择" "1" menu_choice

		case "$menu_choice" in
			1) configure_model ;;
			2) set_active_model ;;
			3) configure_channels ;;
			4) health_check ;;
			5)
				echo ""
				echo -e "  ${CYAN}=== OpenClaw 日志 ===${NC}"
				echo ""
				logread -e openclaw 2>/dev/null | tail -100 || echo "  (无法读取日志)"
				echo ""
				prompt_with_default "按回车继续" "" _
				;;
			6) restart_gateway ;;
			7) advanced_menu ;;
			8) reset_to_defaults ;;
			9) show_current_config ;;
			0)
				echo -e "  ${GREEN}再见！${NC}"
				exit 0
				;;
			*) echo -e "  ${YELLOW}无效选择${NC}" ;;
		esac
	done
}

# ── 高级配置菜单 ──
advanced_menu() {
	while true; do
		local gw_port gw_bind gw_mode log_level acp_dispatch
		gw_port=$(json_get "gateway.port" 2>/dev/null || echo "18789")
		gw_bind=$(json_get "gateway.bind" 2>/dev/null || echo "lan")
		gw_mode=$(json_get "gateway.mode" 2>/dev/null || echo "local")
		log_level=$(json_get "gateway.logLevel" 2>/dev/null || echo "")
		acp_dispatch=$(json_get "acp.dispatch.enabled" 2>/dev/null || echo "false")

		echo ""
		echo -e "  ${BOLD}🔧 高级配置${NC}"
		echo ""
		echo -e "  ${CYAN}1)${NC} Gateway 端口  ${DIM}(当前: ${gw_port})${NC}"
		echo -e "  ${CYAN}2)${NC} Gateway 绑定地址  ${DIM}(当前: ${gw_bind})${NC}"
		echo -e "  ${CYAN}3)${NC} Gateway 运行模式  ${DIM}(当前: ${gw_mode})${NC}"
		echo -e "  ${CYAN}4)${NC} 日志级别  ${DIM}(当前: ${log_level:-未设置})${NC}"
		echo -e "  ${CYAN}5)${NC} ACP Dispatch 设置  ${DIM}(当前: ${acp_dispatch})${NC}"
		echo -e "  ${CYAN}6)${NC} 官方完整配置向导  ${DIM}(oc configure)${NC}"
		echo -e "  ${CYAN}7)${NC} 查看原始配置 JSON"
		echo -e "  ${CYAN}8)${NC} 编辑配置文件  ${DIM}(vi / nano)${NC}"
		echo -e "  ${CYAN}9)${NC} 导出配置备份"
		echo -e "  ${CYAN}10)${NC} 导入配置"
		echo -e "  ${CYAN}0)${NC} 返回主菜单"
		echo ""
		prompt_with_default "请选择" "0" adv_choice

		case "$adv_choice" in
			1)
				echo ""
				prompt_with_default "请输入 Gateway 端口" "$gw_port" new_port
				if [ -n "$new_port" ] && [ "$new_port" != "$gw_port" ]; then
					json_set "gateway.port" "$new_port"
					# 同步到 UCI
					uci set openclaw.main.port="$new_port" 2>/dev/null
					uci commit openclaw 2>/dev/null
					echo -e "  ${GREEN}✅ 端口已设置为 ${new_port}${NC}"
					ask_restart
				fi
				;;
			2)
				echo ""
				echo -e "  ${CYAN}绑定地址选项:${NC}"
				echo "    lan      - 仅 LAN 接口 (推荐)"
				echo "    loopback - 仅本机访问"
				echo "    all      - 所有接口 (0.0.0.0)"
				echo ""
				prompt_with_default "请输入绑定地址" "$gw_bind" new_bind
				if [ -n "$new_bind" ]; then
					case "$new_bind" in
						lan|loopback|all)
							json_set "gateway.bind" "$new_bind"
							uci set openclaw.main.bind="$new_bind" 2>/dev/null
							uci commit openclaw 2>/dev/null
							echo -e "  ${GREEN}✅ 绑定地址已设置为 ${new_bind}${NC}"
							ask_restart
							;;
						*) echo -e "  ${YELLOW}无效选项${NC}" ;;
					esac
				fi
				;;
			3)
				echo ""
				echo -e "  ${CYAN}运行模式选项:${NC}"
				echo "    local  - 本地模式 (推荐)"
				echo "    remote - 远程模式"
				echo ""
				prompt_with_default "请输入运行模式" "$gw_mode" new_mode
				if [ -n "$new_mode" ] && [ "$new_mode" != "$gw_mode" ]; then
					json_set "gateway.mode" "$new_mode"
					echo -e "  ${GREEN}✅ 运行模式已设置为 ${new_mode}${NC}"
					ask_restart
				fi
				;;
			4)
				echo ""
				echo -e "  ${CYAN}日志级别选项:${NC}"
				echo "    debug, info, warn, error"
				echo ""
				prompt_with_default "请输入日志级别" "${log_level:-info}" new_level
				if [ -n "$new_level" ]; then
					json_set "gateway.logLevel" "$new_level"
					echo -e "  ${GREEN}✅ 日志级别已设置为 ${new_level}${NC}"
					ask_restart
				fi
				;;
			5)
				echo ""
				echo -e "  ${CYAN}ACP Dispatch 选项:${NC}"
				echo "    true  - 启用 (可能占用大量内存)"
				echo "    false - 禁用 (推荐路由器使用)"
				echo ""
				prompt_with_default "请输入设置" "$acp_dispatch" new_acp
				case "$new_acp" in
					true|false)
						json_set "acp.dispatch.enabled" "$new_acp"
						echo -e "  ${GREEN}✅ ACP Dispatch 已设置为 ${new_acp}${NC}"
						ask_restart
						;;
					*) echo -e "  ${YELLOW}无效选项${NC}" ;;
				esac
				;;
			6)
				echo ""
				echo -e "  ${CYAN}启动官方配置向导...${NC}"
				oc_cmd configure
				ask_restart
				;;
			7)
				echo ""
				echo -e "  ${CYAN}配置文件路径: ${CONFIG_FILE}${NC}"
				echo ""
				if [ -f "$CONFIG_FILE" ]; then
					"$NODE_BIN" -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('${CONFIG_FILE}','utf8')),null,2))" 2>/dev/null || cat "$CONFIG_FILE"
				else
					echo "  (配置文件不存在)"
				fi
				echo ""
				prompt_with_default "按回车继续" "" _
				;;
			8)
				echo ""
				if [ -f "$CONFIG_FILE" ]; then
					vi "$CONFIG_FILE"
					ask_restart
				else
					echo -e "  ${YELLOW}配置文件不存在${NC}"
				fi
				;;
			9) backup_restore_menu ;;
			10)
				echo ""
				echo -e "  ${CYAN}导入配置${NC}"
				echo ""
				local backup_dir="${OC_STATE_DIR}/backups"
				if [ -d "$backup_dir" ]; then
					echo "  可用备份:"
					ls -lt "$backup_dir"/*.json 2>/dev/null | head -5 | while read -r line; do
						echo "    $(echo "$line" | awk '{print $NF}')"
					done
				fi
				echo ""
				prompt_with_default "请输入备份文件路径" "" import_path
				if [ -n "$import_path" ] && [ -f "$import_path" ]; then
					cp "$import_path" "$CONFIG_FILE"
					chown openclaw:openclaw "$CONFIG_FILE"
					echo -e "  ${GREEN}✅ 配置已导入${NC}"
					ask_restart
				else
					echo -e "  ${YELLOW}文件不存在${NC}"
				fi
				;;
			0) return ;;
			*) echo -e "  ${YELLOW}无效选择${NC}" ;;
		esac
	done
}

# ── 支持命令行参数 ──
case "${1:-}" in
	--set)
		if [ -n "${2:-}" ] && [ -n "${3:-}" ]; then
			json_set "$2" "$3"
			chown openclaw:openclaw "$CONFIG_FILE" 2>/dev/null || true
			echo -e "${GREEN}✅ 已设置 $2${NC}"
		else
			echo "用法: oc-config.sh --set <key> <value>"
		fi
		;;
	--get)
		if [ -n "${2:-}" ]; then
			oc_cmd config get "$2"
		else
			echo "用法: oc-config.sh --get <key>"
		fi
		;;
	--restart)
		restart_gateway
		;;
	--backup)
		bk_dir="${OC_STATE_DIR}/backups"
		mkdir -p "$bk_dir" 2>/dev/null
		echo -e "${CYAN}正在创建配置备份...${NC}"
		cd "$bk_dir" && oc_cmd backup create --only-config --no-include-workspace 2>&1
		;;
	--status)
		show_current_config
		health_check
		;;
	--help|-h)
		echo ""
		echo "OpenClaw AI Gateway — OpenWrt 配置管理工具"
		echo ""
		echo "用法:"
		echo "  oc-config.sh              # 进入交互式菜单"
		echo "  oc-config.sh --set K V    # 设置配置项"
		echo "  oc-config.sh --get K      # 读取配置项"
		echo "  oc-config.sh --restart    # 重启 Gateway"
		echo "  oc-config.sh --status     # 查看状态"
		echo ""
		;;
	"")
		main_menu
		;;
	*)
		echo "未知参数: $1  (使用 --help 查看帮助)"
		exit 1
		;;
esac
