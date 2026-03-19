-- luci-app-openclaw — LuCI Controller
module("luci.controller.openclaw", package.seeall)

function index()
	-- 主入口: 服务 → OpenClaw (🧠 作为菜单图标)
	local page = entry({"admin", "services", "openclaw"}, alias("admin", "services", "openclaw", "basic"), _("OpenClaw"), 90)
	page.dependent = false

	-- 基本设置 (CBI)
	entry({"admin", "services", "openclaw", "basic"}, cbi("openclaw/basic"), _("基本设置"), 10).leaf = true

	-- 配置管理 (View — 嵌入 oc-config Web 终端)
	entry({"admin", "services", "openclaw", "advanced"}, template("openclaw/advanced"), _("配置管理"), 20).leaf = true

	-- Web 控制台 (View — 嵌入 OpenClaw Web UI)
	entry({"admin", "services", "openclaw", "console"}, template("openclaw/console"), _("Web 控制台"), 30).leaf = true

	-- 状态 API (AJAX 接口, 供前端 XHR 调用)
	entry({"admin", "services", "openclaw", "status_api"}, call("action_status"), nil).leaf = true

	-- 服务控制 API
	entry({"admin", "services", "openclaw", "service_ctl"}, call("action_service_ctl"), nil).leaf = true

	-- 安装/升级日志 API (轮询)
	entry({"admin", "services", "openclaw", "setup_log"}, call("action_setup_log"), nil).leaf = true

	-- 版本检查 API (仅检查插件版本)
	entry({"admin", "services", "openclaw", "check_update"}, call("action_check_update"), nil).leaf = true

	-- 卸载运行环境 API
	entry({"admin", "services", "openclaw", "uninstall"}, call("action_uninstall"), nil).leaf = true

	-- 获取网关 Token API (仅认证用户可访问)
	entry({"admin", "services", "openclaw", "get_token"}, call("action_get_token"), nil).leaf = true

	-- 插件升级 API
	entry({"admin", "services", "openclaw", "plugin_upgrade"}, call("action_plugin_upgrade"), nil).leaf = true

	-- 插件升级日志 API (轮询)
	entry({"admin", "services", "openclaw", "plugin_upgrade_log"}, call("action_plugin_upgrade_log"), nil).leaf = true

	-- 配置备份 API (v2026.3.8+: openclaw backup create/verify)
	entry({"admin", "services", "openclaw", "backup"}, call("action_backup"), nil).leaf = true

	-- 系统配置检测 API (安装前检测)
	entry({"admin", "services", "openclaw", "check_system"}, call("action_check_system"), nil).leaf = true
end

-- ═══════════════════════════════════════════
-- 状态查询 API: 返回 JSON
-- ═══════════════════════════════════════════
function action_status()
	local http = require "luci.http"
	local sys = require "luci.sys"
	local uci = require "luci.model.uci".cursor()

	local port = uci:get("openclaw", "main", "port") or "18789"
	local pty_port = uci:get("openclaw", "main", "pty_port") or "18793"
	local enabled = uci:get("openclaw", "main", "enabled") or "0"

	-- 验证端口值为纯数字，防止命令注入
	if not port:match("^%d+$") then port = "18789" end
	if not pty_port:match("^%d+$") then pty_port = "18793" end

	local result = {
		enabled = enabled,
		port = port,
		pty_port = pty_port,
		gateway_running = false,
		gateway_starting = false,
		pty_running = false,
		pid = "",
		memory_kb = 0,
		uptime = "",
		node_version = "",
		oc_version = "",
		plugin_version = "",
	}

	-- 插件版本
	local pvf = io.open("/usr/share/openclaw/VERSION", "r")
	if pvf then
		result.plugin_version = pvf:read("*a"):gsub("%s+", "")
		pvf:close()
	end

	-- 安装方式检测 (离线 / 在线)

	-- 检查 Node.js
	local node_bin = "/opt/openclaw/node/bin/node"
	local f = io.open(node_bin, "r")
	if f then
		f:close()
		local node_ver = sys.exec(node_bin .. " --version 2>/dev/null"):gsub("%s+", "")
		result.node_version = node_ver
	end

	-- OpenClaw 版本 (从 package.json 读取)
	local oc_dirs = {
		"/opt/openclaw/global/lib/node_modules/openclaw",
		"/opt/openclaw/global/node_modules/openclaw",
		"/opt/openclaw/node/lib/node_modules/openclaw",
	}
	for _, d in ipairs(oc_dirs) do
		local pf = io.open(d .. "/package.json", "r")
		if pf then
			local pj = pf:read("*a")
			pf:close()
			local ver = pj:match('"version"%s*:%s*"([^"]+)"')
			if ver and ver ~= "" then
				result.oc_version = ver
				break
			end
		end
	end

	-- 网关端口检查
	local gw_check_cmd = "if command -v ss >/dev/null 2>&1; then ss -tulnp 2>/dev/null | grep -c ':" .. port .. " ' || echo 0; else netstat -tulnp 2>/dev/null | grep -c ':" .. port .. " ' || echo 0; fi"
		local gw_check = sys.exec(gw_check_cmd):gsub("%s+", "")
	result.gateway_running = (tonumber(gw_check) or 0) > 0

	-- 如果端口未监听但 procd 进程存在，说明正在启动中 (gateway 初始化需要数分钟)
	if not result.gateway_running and enabled == "1" then
		local procd_pid = sys.exec("pgrep -f 'openclaw.*gateway' 2>/dev/null | head -1"):gsub("%s+", "")
		if procd_pid ~= "" then
			result.gateway_starting = true
		end
	end

	-- PTY 端口检查
	local pty_check = sys.exec("netstat -tulnp 2>/dev/null | grep -c ':" .. pty_port .. " ' || echo 0"):gsub("%s+", "")
	result.pty_running = (tonumber(pty_check) or 0) > 0

	-- 读取当前活跃模型
	local config_file = "/opt/openclaw/data/.openclaw/openclaw.json"
	local cf = io.open(config_file, "r")
	if cf then
		local content = cf:read("*a")
		cf:close()
		-- 简单正则提取 "primary": "xxx"
		local model = content:match('"primary"%s*:%s*"([^"]+)"')
		if model and model ~= "" then
			result.active_model = model
		end

		-- 读取已配置的渠道列表
		local channels = {}
		if content:match('"qqbot"%s*:%s*{') and content:match('"appId"%s*:%s*"[^"]+"') then
			channels[#channels+1] = "QQ"
		end
		if content:match('"telegram"%s*:%s*{') and content:match('"botToken"%s*:%s*"[^"]+"') then
			channels[#channels+1] = "Telegram"
		end
		if content:match('"discord"%s*:%s*{') then
			channels[#channels+1] = "Discord"
		end
		if content:match('"feishu"%s*:%s*{') then
			channels[#channels+1] = "飞书"
		end
		if content:match('"slack"%s*:%s*{') then
			channels[#channels+1] = "Slack"
		end
		if #channels > 0 then
			result.channels = table.concat(channels, ", ")
		end
	end

	-- PID 和内存
	if result.gateway_running then
		local pid = sys.exec("netstat -tulnp 2>/dev/null | awk '/:" .. port .. " /{split($NF,a,\"/\");print a[1];exit}'"):gsub("%s+", "")
		if pid and pid ~= "" then
			result.pid = pid
			-- 内存 (VmRSS from /proc)
			local rss = sys.exec("awk '/VmRSS/{print $2}' /proc/" .. pid .. "/status 2>/dev/null"):gsub("%s+", "")
			result.memory_kb = tonumber(rss) or 0
			-- 运行时间
			local stat_time = sys.exec("stat -c %Y /proc/" .. pid .. " 2>/dev/null"):gsub("%s+", "")
			local start_ts = tonumber(stat_time) or 0
			if start_ts > 0 then
				local uptime_s = os.time() - start_ts
				local hours = math.floor(uptime_s / 3600)
				local mins = math.floor((uptime_s % 3600) / 60)
				local secs = uptime_s % 60
				if hours > 0 then
					result.uptime = string.format("%dh %dm %ds", hours, mins, secs)
				elseif mins > 0 then
					result.uptime = string.format("%dm %ds", mins, secs)
				else
					result.uptime = string.format("%ds", secs)
				end
			end
		end
	end

	http.prepare_content("application/json")
	http.write_json(result)
end

-- ═══════════════════════════════════════════
-- 服务控制 API: start/stop/restart/setup
-- ═══════════════════════════════════════════
function action_service_ctl()
	local http = require "luci.http"
	local sys = require "luci.sys"

	local action = http.formvalue("action") or ""

	if action == "start" then
		sys.exec("/etc/init.d/openclaw start >/dev/null 2>&1 &")
	elseif action == "stop" then
		sys.exec("/etc/init.d/openclaw stop >/dev/null 2>&1")
		-- stop 后额外等待确保端口释放
		sys.exec("sleep 2")
	elseif action == "restart" then
		-- 先完整 stop (确保端口释放)，再后台 start
		sys.exec("/etc/init.d/openclaw stop >/dev/null 2>&1")
		sys.exec("sleep 2")
		sys.exec("/etc/init.d/openclaw start >/dev/null 2>&1 &")
	elseif action == "enable" then
		sys.exec("/etc/init.d/openclaw enable 2>/dev/null")
	elseif action == "disable" then
		sys.exec("/etc/init.d/openclaw disable 2>/dev/null")
	elseif action == "setup" then
		-- 先清理旧日志和状态
		sys.exec("rm -f /tmp/openclaw-setup.log /tmp/openclaw-setup.pid /tmp/openclaw-setup.exit")
		-- 获取用户选择的版本 (stable=指定版本, latest=最新版)
		local version = http.formvalue("version") or ""
		local env_prefix = ""
		if version == "stable" then
			-- 稳定版: 读取 openclaw-env 中定义的 OC_TESTED_VERSION
			local tested_ver = sys.exec("grep '^OC_TESTED_VERSION=' /usr/bin/openclaw-env 2>/dev/null | cut -d'\"' -f2"):gsub("%s+", "")
			if tested_ver ~= "" then
				env_prefix = "OC_VERSION=" .. tested_ver .. " "
			end
		elseif version ~= "" and version ~= "latest" then
			-- 校验版本号格式 (仅允许数字、点、横线、字母)
			if version:match("^[%d%.%-a-zA-Z]+$") then
				env_prefix = "OC_VERSION=" .. version .. " "
			end
		end
		-- 后台安装，成功后自动启用并启动服务
		-- 注: openclaw-env 脚本有 set -e，init_openclaw 中的非关键失败不应阻止启动
		sys.exec("( " .. env_prefix .. "/usr/bin/openclaw-env setup > /tmp/openclaw-setup.log 2>&1; RC=$?; echo $RC > /tmp/openclaw-setup.exit; if [ $RC -eq 0 ]; then uci set openclaw.main.enabled=1; uci commit openclaw; /etc/init.d/openclaw enable 2>/dev/null; sleep 1; /etc/init.d/openclaw start >> /tmp/openclaw-setup.log 2>&1; fi ) & echo $! > /tmp/openclaw-setup.pid")
		http.prepare_content("application/json")
		http.write_json({ status = "ok", message = "安装已启动，请查看安装日志..." })
		return
	else
		http.prepare_content("application/json")
		http.write_json({ status = "error", message = "未知操作: " .. action })
		return
	end

	http.prepare_content("application/json")
	http.write_json({ status = "ok", action = action })
end

-- ═══════════════════════════════════════════
-- 安装日志轮询 API
-- ═══════════════════════════════════════════
function action_setup_log()
	local http = require "luci.http"
	local sys = require "luci.sys"

	-- 读取日志内容
	local log = ""
	local f = io.open("/tmp/openclaw-setup.log", "r")
	if f then
		log = f:read("*a") or ""
		f:close()
	end

	-- 检查进程是否还在运行
	local running = false
	local pid_file = io.open("/tmp/openclaw-setup.pid", "r")
	if pid_file then
		local pid = pid_file:read("*a"):gsub("%s+", "")
		pid_file:close()
		if pid ~= "" then
			local check = sys.exec("kill -0 " .. pid .. " 2>/dev/null && echo yes || echo no"):gsub("%s+", "")
			running = (check == "yes")
		end
	end

	-- 读取退出码
	local exit_code = -1
	if not running then
		local exit_file = io.open("/tmp/openclaw-setup.exit", "r")
		if exit_file then
			local code = exit_file:read("*a"):gsub("%s+", "")
			exit_file:close()
			exit_code = tonumber(code) or -1
		end
	end

	-- 判断状态
	local state = "idle"
	if running then
		state = "running"
	elseif exit_code == 0 then
		state = "success"
	elseif exit_code > 0 then
		state = "failed"
	end

	http.prepare_content("application/json")
	http.write_json({
		state = state,
		exit_code = exit_code,
		log = log
	})
end

-- ═══════════════════════════════════════════
-- 版本检查 API
-- ═══════════════════════════════════════════
function action_check_update()
	local http = require "luci.http"
	local sys = require "luci.sys"

	-- 插件版本检查 (从 GitHub API 获取最新 release tag + release notes)
	local plugin_current = ""
	local pf = io.open("/usr/share/openclaw/VERSION", "r")
		or io.open("/root/luci-app-openclaw/VERSION", "r")
	if pf then
		plugin_current = pf:read("*a"):gsub("%s+", "")
		pf:close()
	end

	local plugin_latest = ""
	local release_notes = ""
	local plugin_has_update = false

	-- 使用 GitHub API 获取最新 release (tag + body)
	local gh_json = sys.exec("curl -sf --connect-timeout 5 --max-time 10 'https://api.github.com/repos/10000ge10000/luci-app-openclaw/releases/latest' 2>/dev/null")
	if gh_json and gh_json ~= "" then
		-- 提取 tag_name
		local tag = gh_json:match('"tag_name"%s*:%s*"([^"]+)"')
		if tag and tag ~= "" then
			plugin_latest = tag:gsub("^v", ""):gsub("%s+", "")
		end
		-- 提取 body (release notes), 处理 JSON 转义
		-- 结束引号后可能紧跟 \n、空格、, 或 }，用宽松匹配
		local body = gh_json:match('"body"%s*:%s*"(.-)"[,}%]\n ]')
		if body and body ~= "" then
			-- 还原 JSON 转义: \n \r \" \\
			body = body:gsub("\\n", "\n"):gsub("\\r", ""):gsub('\\"', '"'):gsub("\\\\", "\\")
			release_notes = body
		end
	end

	if plugin_current ~= "" and plugin_latest ~= "" and plugin_current ~= plugin_latest then
		plugin_has_update = true
	end

	http.prepare_content("application/json")
	http.write_json({
		status = "ok",
		plugin_current = plugin_current,
		plugin_latest = plugin_latest,
		plugin_has_update = plugin_has_update,
		release_notes = release_notes
	})
end

-- ═══════════════════════════════════════════
-- 卸载运行环境 API
-- ═══════════════════════════════════════════
function action_uninstall()
	local http = require "luci.http"
	local sys = require "luci.sys"

	-- 停止服务
	sys.exec("/etc/init.d/openclaw stop >/dev/null 2>&1")
	-- 禁用开机启动
	sys.exec("/etc/init.d/openclaw disable 2>/dev/null")
	-- 设置 UCI enabled=0
	sys.exec("uci set openclaw.main.enabled=0; uci commit openclaw 2>/dev/null")
	-- 删除 Node.js + OpenClaw 运行环境 (包含所有插件: qqbot, 飞书等)
	sys.exec("rm -rf /opt/openclaw")
	-- 清理旧数据迁移后可能残留的目录
	sys.exec("rm -rf /root/.openclaw 2>/dev/null")
	-- 清理临时文件
	sys.exec("rm -f /tmp/openclaw-setup.* /tmp/openclaw-update.log /tmp/openclaw-plugin-upgrade.* /var/run/openclaw*.pid")
	-- 清理 LuCI 缓存
	sys.exec("rm -f /tmp/luci-indexcache /tmp/luci-modulecache/* 2>/dev/null")
	-- 删除 openclaw 系统用户
	sys.exec("sed -i '/^openclaw:/d' /etc/passwd /etc/shadow /etc/group 2>/dev/null")

	http.prepare_content("application/json")
	http.write_json({
		status = "ok",
		message = "运行环境已卸载。已清理: Node.js 运行环境 (/opt/openclaw)、所有插件 (qqbot/飞书等)、旧数据目录 (/root/.openclaw)、临时文件、LuCI 缓存。"
	})
end

-- ═══════════════════════════════════════════
-- 获取 Token API
-- 仅通过 LuCI 认证后可调用，避免 Token 嵌入 HTML 源码
-- 返回网关 Token 和 PTY Token
-- ═══════════════════════════════════════════
function action_get_token()
	local http = require "luci.http"
	local uci = require "luci.model.uci".cursor()
	local token = uci:get("openclaw", "main", "token") or ""
	local pty_token = uci:get("openclaw", "main", "pty_token") or ""
	http.prepare_content("application/json")
	http.write_json({ token = token, pty_token = pty_token })
end

-- ═══════════════════════════════════════════
-- 插件升级 API (后台下载 .run 并执行)
-- 参数: version — 目标版本号 (如 1.0.8)
-- ═══════════════════════════════════════════
function action_plugin_upgrade()
	local http = require "luci.http"
	local sys = require "luci.sys"

	local version = http.formvalue("version") or ""
	if version == "" then
		http.prepare_content("application/json")
		http.write_json({ status = "error", message = "缺少版本号参数" })
		return
	end

	-- 安全检查: version 只允许数字和点
	if not version:match("^[%d%.]+$") then
		http.prepare_content("application/json")
		http.write_json({ status = "error", message = "版本号格式无效" })
		return
	end

	-- 清理旧日志和状态
	sys.exec("rm -f /tmp/openclaw-plugin-upgrade.log /tmp/openclaw-plugin-upgrade.pid /tmp/openclaw-plugin-upgrade.exit")

	-- 后台执行: 下载 .run 并执行安装
	local run_url = "https://github.com/10000ge10000/luci-app-openclaw/releases/download/v" .. version .. "/luci-app-openclaw_" .. version .. ".run"
	-- 使用 curl 下载 (-L 跟随重定向), 然后 sh 执行
	sys.exec(string.format(
		"( echo '正在下载插件 v%s ...' > /tmp/openclaw-plugin-upgrade.log; " ..
		"curl -sL --connect-timeout 15 --max-time 120 -o /tmp/luci-app-openclaw-update.run '%s' >> /tmp/openclaw-plugin-upgrade.log 2>&1; " ..
		"RC=$?; " ..
		"if [ $RC -ne 0 ]; then " ..
		"  echo '下载失败 (curl exit: '$RC')' >> /tmp/openclaw-plugin-upgrade.log; " ..
		"  echo '如果无法访问 GitHub，请手动下载: %s' >> /tmp/openclaw-plugin-upgrade.log; " ..
		"  echo $RC > /tmp/openclaw-plugin-upgrade.exit; " ..
		"else " ..
		"  FSIZE=$(wc -c < /tmp/luci-app-openclaw-update.run 2>/dev/null | tr -d ' '); " ..
		"  echo \"下载完成 (${FSIZE} bytes)\" >> /tmp/openclaw-plugin-upgrade.log; " ..
		"  FHEAD=$(head -c 9 /tmp/luci-app-openclaw-update.run 2>/dev/null); " ..
		"  if [ \"$FSIZE\" -lt 10000 ] 2>/dev/null; then " ..
		"    if [ \"$FHEAD\" = 'Not Found' ]; then " ..
		"      echo '❌ GitHub 返回 \"Not Found\"，可能是网络被拦截（GFW）或 Release 资产不存在' >> /tmp/openclaw-plugin-upgrade.log; " ..
		"    else " ..
		"      echo '❌ 文件过小，可能 GitHub 访问受限或网络异常' >> /tmp/openclaw-plugin-upgrade.log; " ..
		"    fi; " ..
		"    echo '请检查路由器是否能访问 github.com，或手动下载后安装: %s' >> /tmp/openclaw-plugin-upgrade.log; " ..
		"    echo 1 > /tmp/openclaw-plugin-upgrade.exit; " ..
		"  else " ..
		"    echo '' >> /tmp/openclaw-plugin-upgrade.log; " ..
		"    echo '正在安装...' >> /tmp/openclaw-plugin-upgrade.log; " ..
		"    sh /tmp/luci-app-openclaw-update.run >> /tmp/openclaw-plugin-upgrade.log 2>&1; " ..
		"    RC2=$?; echo $RC2 > /tmp/openclaw-plugin-upgrade.exit; " ..
		"    if [ $RC2 -eq 0 ]; then " ..
		"      echo '' >> /tmp/openclaw-plugin-upgrade.log; " ..
		"      echo '✅ 插件升级完成！请刷新浏览器页面。' >> /tmp/openclaw-plugin-upgrade.log; " ..
		"    else " ..
		"      echo '安装执行失败 (exit: '$RC2')' >> /tmp/openclaw-plugin-upgrade.log; " ..
		"    fi; " ..
		"  fi; " ..
		"  rm -f /tmp/luci-app-openclaw-update.run; " ..
		"fi " ..
		") & echo $! > /tmp/openclaw-plugin-upgrade.pid",
		version, run_url, run_url, run_url
	))

	http.prepare_content("application/json")
	http.write_json({
		status = "ok",
		message = "插件升级已在后台启动..."
	})
end

-- ═══════════════════════════════════════════
-- 插件升级日志轮询 API
-- ═══════════════════════════════════════════
function action_plugin_upgrade_log()
	local http = require "luci.http"
	local sys = require "luci.sys"

	local log = ""
	local f = io.open("/tmp/openclaw-plugin-upgrade.log", "r")
	if f then
		log = f:read("*a") or ""
		f:close()
	end

	local running = false
	local pid_file = io.open("/tmp/openclaw-plugin-upgrade.pid", "r")
	if pid_file then
		local pid = pid_file:read("*a"):gsub("%s+", "")
		pid_file:close()
		if pid ~= "" then
			local check = sys.exec("kill -0 " .. pid .. " 2>/dev/null && echo yes || echo no"):gsub("%s+", "")
			running = (check == "yes")
		end
	end

	local exit_code = -1
	if not running then
		local exit_file = io.open("/tmp/openclaw-plugin-upgrade.exit", "r")
		if exit_file then
			local code = exit_file:read("*a"):gsub("%s+", "")
			exit_file:close()
			exit_code = tonumber(code) or -1
		end
	end

	local state = "idle"
	if running then
		state = "running"
	elseif exit_code == 0 then
		state = "success"
	elseif exit_code > 0 then
		state = "failed"
	end

	http.prepare_content("application/json")
	http.write_json({
		status = "ok",
		log = log,
		state = state,
		running = running,
		exit_code = exit_code
	})
end

-- ═══════════════════════════════════════════
-- 配置备份 API (v2026.3.8+)
-- action=create: 创建配置备份
-- action=verify:  验证最新备份
-- action=list:    列出现有备份(含类型/大小)
-- action=delete:  删除指定备份文件
-- ═══════════════════════════════════════════
function action_backup()
	local http = require "luci.http"
	local sys = require "luci.sys"
	local action = http.formvalue("action") or "create"

	local node_bin = "/opt/openclaw/node/bin/node"
	local oc_entry = ""

	-- 查找 openclaw 入口
	local search_dirs = {
		"/opt/openclaw/global/lib/node_modules/openclaw",
		"/opt/openclaw/global/node_modules/openclaw",
		"/opt/openclaw/node/lib/node_modules/openclaw",
	}
	for _, d in ipairs(search_dirs) do
		if nixio.fs.stat(d .. "/openclaw.mjs", "type") then
			oc_entry = d .. "/openclaw.mjs"
			break
		elseif nixio.fs.stat(d .. "/dist/cli.js", "type") then
			oc_entry = d .. "/dist/cli.js"
			break
		end
	end

	if oc_entry == "" then
		http.prepare_content("application/json")
		http.write_json({ status = "error", message = "OpenClaw 未安装，无法执行备份操作" })
		return
	end

	local env_prefix = string.format(
		"HOME=/opt/openclaw/data OPENCLAW_HOME=/opt/openclaw/data " ..
		"OPENCLAW_STATE_DIR=/opt/openclaw/data/.openclaw " ..
		"OPENCLAW_CONFIG_PATH=/opt/openclaw/data/.openclaw/openclaw.json " ..
		"PATH=/opt/openclaw/node/bin:/opt/openclaw/global/bin:$PATH "
	)

	-- 备份目录 (openclaw backup create 输出到 CWD，需要 cd)
	local backup_dir = "/opt/openclaw/data/.openclaw/backups"
	local cd_prefix = "mkdir -p " .. backup_dir .. " && cd " .. backup_dir .. " && "

	-- ── 辅助: 解析单个备份文件的 manifest 信息 ──
	local function parse_backup_info(filepath)
		local filename = filepath:match("([^/]+)$") or filepath
		-- 文件大小
		local st = nixio.fs.stat(filepath)
		local size = st and st.size or 0
		-- 从文件名提取时间戳: 2026-03-11T18-28-43.149Z-openclaw-backup.tar.gz
		local ts = filename:match("^(%d%d%d%d%-%d%d%-%d%dT%d%d%-%d%d%-%d%d%.%d+Z)")
		local display_time = ""
		if ts then
			-- 2026-03-11T18-28-43.149Z -> 2026-03-11 18:28:43
			display_time = ts:gsub("T", " "):gsub("(%d%d)%-(%d%d)%-(%d%d)%.%d+Z", "%1:%2:%3")
		end
		-- 读取 manifest.json 判断备份类型
		local backup_type = "unknown"
		local manifest_json = sys.exec(
			"tar --wildcards -xzf " .. filepath .. " '*/manifest.json' -O 2>/dev/null"
		)
		if manifest_json and manifest_json ~= "" then
			-- 简单字符串匹配，避免依赖 JSON 库
			if manifest_json:match('"onlyConfig"%s*:%s*true') then
				backup_type = "config"
			elseif manifest_json:match('"onlyConfig"%s*:%s*false') then
				backup_type = "full"
			end
		else
			-- 无法读取 manifest，通过文件大小推断
			if size < 50000 then
				backup_type = "config"
			else
				backup_type = "full"
			end
		end
		-- 格式化大小
		local size_str
		if size >= 1073741824 then
			size_str = string.format("%.1f GB", size / 1073741824)
		elseif size >= 1048576 then
			size_str = string.format("%.1f MB", size / 1048576)
		elseif size >= 1024 then
			size_str = string.format("%.1f KB", size / 1024)
		else
			size_str = tostring(size) .. " B"
		end
		return {
			filename = filename,
			filepath = filepath,
			size = size,
			size_str = size_str,
			time = display_time,
			backup_type = backup_type
		}
	end

	if action == "create" then
		local only_config = http.formvalue("only_config") or "1"
		local backup_cmd
		if only_config == "1" then
			backup_cmd = cd_prefix .. env_prefix .. node_bin .. " " .. oc_entry .. " backup create --only-config --no-include-workspace 2>&1"
		else
			backup_cmd = cd_prefix .. "HOME=" .. backup_dir .. " " .. env_prefix .. node_bin .. " " .. oc_entry .. " backup create --no-include-workspace 2>&1"
		end
		local output = sys.exec(backup_cmd)
		-- 完整备份可能输出到 HOME，移动到 backup_dir
		sys.exec("mv /opt/openclaw/data/*-openclaw-backup.tar.gz " .. backup_dir .. "/ 2>/dev/null")
		-- 提取备份文件路径
		local backup_path = output:match("([%S]+%.tar%.gz)")
		http.prepare_content("application/json")
		http.write_json({
			status = "ok",
			action = "create",
			output = output,
			backup_path = backup_path or ""
		})
	elseif action == "verify" then
		-- 找到最新的备份文件
		local latest = sys.exec("ls -t " .. backup_dir .. "/*-openclaw-backup.tar.gz 2>/dev/null | head -1"):gsub("%s+", "")
		if latest == "" then
			http.prepare_content("application/json")
			http.write_json({ status = "error", message = "未找到备份文件，请先创建备份" })
			return
		end
		local output = sys.exec(env_prefix .. node_bin .. " " .. oc_entry .. " backup verify " .. latest .. " 2>&1")
		http.prepare_content("application/json")
		http.write_json({
			status = "ok",
			action = "verify",
			output = output,
			backup_path = latest
		})
	elseif action == "restore" then
		-- 支持指定文件名，不指定则用最新
		local target_file = http.formvalue("file") or ""
		local restore_path = ""
		if target_file ~= "" then
			-- 安全: 只允许文件名，不允许路径穿越
			target_file = target_file:match("([^/]+)$") or ""
			if target_file:match("%-openclaw%-backup%.tar%.gz$") then
				restore_path = backup_dir .. "/" .. target_file
			end
		end
		if restore_path == "" or not nixio.fs.stat(restore_path, "type") then
			-- fallback 到最新
			restore_path = sys.exec("ls -t " .. backup_dir .. "/*-openclaw-backup.tar.gz 2>/dev/null | head -1"):gsub("%s+", "")
		end
		if restore_path == "" then
			http.prepare_content("application/json")
			http.write_json({ status = "error", message = "未找到备份文件，请先创建备份" })
			return
		end
		local oc_data_dir = "/opt/openclaw/data/.openclaw"
		local config_path = oc_data_dir .. "/openclaw.json"

		-- 1) 先验证备份中的 openclaw.json 是否有效
		local check_cmd = "tar -xzf " .. restore_path .. " --wildcards '*/openclaw.json' -O 2>/dev/null"
		local json_content = sys.exec(check_cmd)
		if not json_content or json_content == "" then
			http.prepare_content("application/json")
			http.write_json({ status = "error", message = "备份文件中未找到 openclaw.json" })
			return
		end
		-- 写入临时文件并用 node 验证
		local tmpfile = "/tmp/oc-restore-check.json"
		local f = io.open(tmpfile, "w")
		if f then f:write(json_content); f:close() end
		local check = sys.exec(node_bin .. " -e \"try{JSON.parse(require('fs').readFileSync('" .. tmpfile .. "','utf8'));console.log('OK')}catch(e){console.log('FAIL')}\" 2>/dev/null"):gsub("%s+", "")
		os.remove(tmpfile)
		if check ~= "OK" then
			http.prepare_content("application/json")
			http.write_json({ status = "error", message = "备份文件中的配置无效，恢复已取消" })
			return
		end

		-- 2) 备份当前配置
		sys.exec("cp -f " .. config_path .. " " .. config_path .. ".pre-restore 2>/dev/null")

		-- 3) 获取备份名前缀 (如: 2026-03-11T18-21-17.209Z-openclaw-backup)
		--    备份结构: <backup_name>/payload/posix/<绝对路径>
		local first_entry = sys.exec("tar -tzf " .. restore_path .. " 2>/dev/null | head -1"):gsub("%s+", "")
		local backup_name = first_entry:match("^([^/]+)/") or ""
		if backup_name == "" then
			http.prepare_content("application/json")
			http.write_json({ status = "error", message = "备份文件格式无法识别" })
			return
		end
		local payload_prefix = backup_name .. "/payload/posix/"
		-- strip 3 层: <backup_name> / payload / posix
		local strip_count = 3

		-- 4) 停止服务
		sys.exec("/etc/init.d/openclaw stop >/dev/null 2>&1")
		-- 等待端口释放
		sys.exec("sleep 2")

		-- 5) 提取 payload 文件到根目录 (还原到原始绝对路径)
		--    注: --wildcards 与 --strip-components 组合在某些 tar 版本不兼容
		--    使用精确路径前缀代替 wildcards
		local extract_cmd = string.format(
			"tar -xzf %s --strip-components=%d -C / '%s' 2>&1",
			restore_path, strip_count, payload_prefix
		)
		local extract_out = sys.exec(extract_cmd)

		-- 6) 修复权限
		sys.exec("chown -R openclaw:openclaw " .. oc_data_dir .. " 2>/dev/null")

		-- 7) 重启服务
		sys.exec("/etc/init.d/openclaw start >/dev/null 2>&1 &")

		http.prepare_content("application/json")
		http.write_json({
			status = "ok",
			action = "restore",
			message = "已从备份完整恢复所有配置和数据，服务正在重启。原配置已保存为 openclaw.json.pre-restore",
			backup_path = restore_path,
			extract_output = extract_out or ""
		})
	elseif action == "list" then
		-- 返回结构化的备份文件列表(含类型/大小/时间)
		local files_raw = sys.exec("ls -t " .. backup_dir .. "/*-openclaw-backup.tar.gz 2>/dev/null"):gsub("%s+$", "")
		local backups = {}
		if files_raw ~= "" then
			for fpath in files_raw:gmatch("[^\n]+") do
				fpath = fpath:gsub("%s+", "")
				if fpath ~= "" then
					backups[#backups + 1] = parse_backup_info(fpath)
				end
				-- 最多返回 20 条
				if #backups >= 20 then break end
			end
		end
		http.prepare_content("application/json")
		http.write_json({
			status = "ok",
			action = "list",
			backups = backups
		})
	elseif action == "delete" then
		local target_file = http.formvalue("file") or ""
		-- 安全: 只允许文件名，不允许路径穿越
		target_file = target_file:match("([^/]+)$") or ""
		if target_file == "" or not target_file:match("%-openclaw%-backup%.tar%.gz$") then
			http.prepare_content("application/json")
			http.write_json({ status = "error", message = "无效的备份文件名" })
			return
		end
		local del_path = backup_dir .. "/" .. target_file
		if not nixio.fs.stat(del_path, "type") then
			http.prepare_content("application/json")
			http.write_json({ status = "error", message = "备份文件不存在" })
			return
		end
		os.remove(del_path)
		http.prepare_content("application/json")
		http.write_json({
			status = "ok",
			action = "delete",
			message = "已删除备份: " .. target_file
		})
	else
		http.prepare_content("application/json")
		http.write_json({ status = "error", message = "未知备份操作: " .. action })
	end
end

-- ═══════════════════════════════════════════
-- 系统配置检测 API (安装前检测)
-- 检测内存和磁盘空间是否满足最低要求
-- 要求: 内存 > 1GB, 磁盘可用空间 > 1.5GB
-- ═══════════════════════════════════════════
function action_check_system()
	local http = require "luci.http"
	local sys = require "luci.sys"

	-- 最低要求配置
	local MIN_MEMORY_MB = 1024      -- 1GB
	local MIN_DISK_MB = 1536        -- 1.5GB

	local result = {
		memory_mb = 0,
		memory_ok = false,
		disk_mb = 0,
		disk_ok = false,
		disk_path = "",
		pass = false,
		message = ""
	}

	-- 检测总内存 (从 /proc/meminfo 读取 MemTotal)
	local meminfo = io.open("/proc/meminfo", "r")
	if meminfo then
		for line in meminfo:lines() do
			local mem_total = line:match("MemTotal:%s+(%d+)%s+kB")
			if mem_total then
				result.memory_mb = math.floor(tonumber(mem_total) / 1024)
				break
			end
		end
		meminfo:close()
	end
	result.memory_ok = result.memory_mb >= MIN_MEMORY_MB

	-- 检测磁盘可用空间
	-- 优先检测 /opt 所在分区，如果 /opt 不存在则检测 /overlay 或 /
	local disk_paths = {"/opt", "/overlay", "/"}
	for _, path in ipairs(disk_paths) do
		local df_output = sys.exec("df -m " .. path .. " 2>/dev/null | tail -1 | awk '{print $4}'"):gsub("%s+", "")
		if df_output and df_output ~= "" and tonumber(df_output) then
			result.disk_mb = tonumber(df_output)
			result.disk_path = path
			break
		end
	end
	result.disk_ok = result.disk_mb >= MIN_DISK_MB

	-- 综合判断
	result.pass = result.memory_ok and result.disk_ok

	-- 生成提示信息
	if result.pass then
		result.message = "系统配置检测通过"
	else
		local issues = {}
		if not result.memory_ok then
			table.insert(issues, string.format("内存不足: 当前 %d MB，需要至少 %d MB", result.memory_mb, MIN_MEMORY_MB))
		end
		if not result.disk_ok then
			table.insert(issues, string.format("磁盘空间不足: 当前 %d MB 可用，需要至少 %d MB", result.disk_mb, MIN_DISK_MB))
		end
		result.message = table.concat(issues, "；")
	end

	http.prepare_content("application/json")
	http.write_json(result)
end
