-- luci-app-openclaw — 基本设置 CBI Model
local sys = require "luci.sys"

m = Map("openclaw", "OpenClaw AI 网关",
	"OpenClaw 是一个 AI 编程代理网关，支持 GitHub Copilot、Claude、GPT、Gemini 等大模型以及 QQ、Telegram、Discord 等多种消息渠道。")

-- 隐藏底部的「保存并应用」「保存」「复位」按钮 (本页无可编辑的 UCI 选项)
m.pageaction = false

-- ═══════════════════════════════════════════
-- 状态面板
-- ═══════════════════════════════════════════
m:section(SimpleSection).template = "openclaw/status"

-- ═══════════════════════════════════════════
-- 快捷操作
-- ═══════════════════════════════════════════
s3 = m:section(SimpleSection, nil, "快捷操作")
s3.template = "cbi/nullsection"

act = s3:option(DummyValue, "_actions")
act.rawhtml = true
act.cfgvalue = function(self, section)
	local ctl_url = luci.dispatcher.build_url("admin", "services", "openclaw", "service_ctl")
	local log_url = luci.dispatcher.build_url("admin", "services", "openclaw", "setup_log")
	local check_url = luci.dispatcher.build_url("admin", "services", "openclaw", "check_update")
	local uninstall_url = luci.dispatcher.build_url("admin", "services", "openclaw", "uninstall")
	local plugin_upgrade_url = luci.dispatcher.build_url("admin", "services", "openclaw", "plugin_upgrade")
	local plugin_upgrade_log_url = luci.dispatcher.build_url("admin", "services", "openclaw", "plugin_upgrade_log")
	local check_system_url = luci.dispatcher.build_url("admin", "services", "openclaw", "check_system")
	local html = {}

	-- 按钮区域
	html[#html+1] = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0;">'
	html[#html+1] = '<button class="btn cbi-button cbi-button-apply" type="button" onclick="ocShowSetupDialog()" id="btn-setup" title="下载 Node.js 并安装 OpenClaw">📦 安装运行环境</button>'
	html[#html+1] = '<button class="btn cbi-button cbi-button-action" type="button" onclick="ocServiceCtl(\'restart\')">🔄 重启服务</button>'
	html[#html+1] = '<button class="btn cbi-button cbi-button-action" type="button" onclick="ocServiceCtl(\'stop\')">⏹️ 停止服务</button>'
	html[#html+1] = '<span style="position:relative;display:inline-block;" id="btn-check-update-wrap"><button class="btn cbi-button cbi-button-action" type="button" onclick="ocCheckUpdate()" id="btn-check-update">🔍 检测升级</button><span id="update-dot" style="display:none;position:absolute;top:-2px;right:-2px;width:10px;height:10px;background:#e36209;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1px #e36209;"></span></span>'
	html[#html+1] = '<button class="btn cbi-button cbi-button-action" type="button" onclick="ocBackupRestore()" id="btn-backup" title="备份或恢复 OpenClaw 配置">💾 备份/恢复</button>'
	html[#html+1] = '<button class="btn cbi-button cbi-button-remove" type="button" onclick="ocUninstall()" id="btn-uninstall" title="删除 Node.js、OpenClaw 运行环境及相关数据">🗑️ 卸载环境</button>'
	html[#html+1] = '</div>'
	html[#html+1] = '<div id="action-result" style="margin-top:8px;"></div>'
	html[#html+1] = '<div id="oc-update-action" style="margin-top:8px;display:none;"></div>'

	-- 版本选择对话框 (默认隐藏)
	html[#html+1] = '<div id="oc-setup-dialog" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;align-items:center;justify-content:center;">'
	html[#html+1] = '<div style="background:#fff;border-radius:12px;padding:24px 28px;max-width:480px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);">'
	html[#html+1] = '<h3 style="margin:0 0 16px 0;font-size:16px;color:#333;">📦 选择安装版本</h3>'
	html[#html+1] = '<div style="display:flex;flex-direction:column;gap:12px;">'
	-- 稳定版选项
	html[#html+1] = '<label style="display:flex;align-items:flex-start;gap:10px;padding:14px 16px;border:2px solid #4a90d9;border-radius:8px;cursor:pointer;background:#f0f7ff;" id="oc-opt-stable">'
	html[#html+1] = '<input type="radio" name="oc-ver-choice" value="stable" checked style="margin-top:2px;">'
	html[#html+1] = '<div><strong style="color:#333;">✅ 稳定版 (推荐)</strong>'
	html[#html+1] = '<div style="font-size:12px;color:#666;margin-top:4px;">版本 v' .. luci.sys.exec("sed -n 's/^OC_TESTED_VERSION=\"\\(.*\\)\"/\\1/p' /usr/bin/openclaw-env 2>/dev/null"):gsub("%s+", "") .. '，已经过完整测试，兼容性良好。</div>'
	html[#html+1] = '</div></label>'
	-- 最新版选项
	html[#html+1] = '<label style="display:flex;align-items:flex-start;gap:10px;padding:14px 16px;border:2px solid #e0e0e0;border-radius:8px;cursor:pointer;background:#fff;" id="oc-opt-latest">'
	html[#html+1] = '<input type="radio" name="oc-ver-choice" value="latest" style="margin-top:2px;">'
	html[#html+1] = '<div><strong style="color:#333;">🆕 最新版</strong>'
	html[#html+1] = '<div style="font-size:12px;color:#e36209;margin-top:4px;">⚠️ 安装 npm 上的最新发布版本，可能存在未经验证的兼容性问题。</div>'
	html[#html+1] = '</div></label>'
	html[#html+1] = '</div>'
	-- 按钮区
	html[#html+1] = '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">'
	html[#html+1] = '<button class="btn cbi-button" type="button" onclick="ocCloseSetupDialog()" style="min-width:80px;">取消</button>'
	html[#html+1] = '<button class="btn cbi-button cbi-button-apply" type="button" onclick="ocConfirmSetup()" style="min-width:80px;">开始安装</button>'
	html[#html+1] = '</div>'
	html[#html+1] = '</div></div>'

	-- 安装日志面板 (默认隐藏)
	html[#html+1] = '<div id="setup-log-panel" style="display:none;margin-top:12px;">'
	html[#html+1] = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">'
	html[#html+1] = '<span id="setup-log-title" style="font-weight:600;font-size:14px;">📋 安装日志</span>'
	html[#html+1] = '<span id="setup-log-status" style="font-size:12px;color:#999;"></span>'
	html[#html+1] = '</div>'
	html[#html+1] = '<pre id="setup-log-content" style="background:#1a1b26;color:#a9b1d6;padding:14px 16px;border-radius:6px;font-size:12px;line-height:1.6;max-height:400px;overflow-y:auto;white-space:pre-wrap;word-break:break-all;border:1px solid #2d333b;margin:0;"></pre>'
	html[#html+1] = '<div id="setup-log-result" style="margin-top:10px;display:none;"></div>'
	html[#html+1] = '</div>'

	-- JavaScript
	html[#html+1] = '<script type="text/javascript">'

	-- 版本选择对话框逻辑
	html[#html+1] = 'var _setupTimer=null;'
	html[#html+1] = 'function ocShowSetupDialog(){'
	html[#html+1] = 'var dlg=document.getElementById("oc-setup-dialog");'
	html[#html+1] = 'dlg.style.display="flex";'
	html[#html+1] = 'var radios=document.getElementsByName("oc-ver-choice");'
	html[#html+1] = 'for(var i=0;i<radios.length;i++){if(radios[i].value==="stable")radios[i].checked=true;}'
	html[#html+1] = '}'
	html[#html+1] = 'function ocCloseSetupDialog(){'
	html[#html+1] = 'document.getElementById("oc-setup-dialog").style.display="none";'
	html[#html+1] = '}'
	html[#html+1] = 'function ocConfirmSetup(){'
	html[#html+1] = 'var btn=document.getElementById("btn-setup");'
	html[#html+1] = 'btn.disabled=true;btn.textContent="⏳ 检测系统配置...";'
	html[#html+1] = '(new XHR()).get("' .. check_system_url .. '",null,function(x){'
	html[#html+1] = 'try{'
	html[#html+1] = 'var r=JSON.parse(x.responseText);'
	html[#html+1] = 'var panel=document.getElementById("setup-log-panel");'
	html[#html+1] = 'var logEl=document.getElementById("setup-log-content");'
	html[#html+1] = 'var titleEl=document.getElementById("setup-log-title");'
	html[#html+1] = 'var statusEl=document.getElementById("setup-log-status");'
	html[#html+1] = 'var resultEl=document.getElementById("setup-log-result");'
	html[#html+1] = 'var actionEl=document.getElementById("action-result");'
	html[#html+1] = 'actionEl.textContent="";'
	html[#html+1] = 'panel.style.display="block";'
	html[#html+1] = 'resultEl.style.display="none";'
	html[#html+1] = 'titleEl.textContent="📋 安装日志";'
	html[#html+1] = 'logEl.textContent="";'
	html[#html+1] = 'logEl.textContent+="════════════════════════════════════════\\n";'
	html[#html+1] = 'logEl.textContent+="🔍 系统配置检测\\n";'
	html[#html+1] = 'logEl.textContent+="════════════════════════════════════════\\n";'
	html[#html+1] = 'logEl.textContent+="内存: "+r.memory_mb+" MB (需要 ≥ 1024 MB) — "+(r.memory_ok?"✅ 通过":"❌ 不达标")+"\\n";'
	html[#html+1] = 'logEl.textContent+="磁盘: "+r.disk_mb+" MB 可用 (需要 ≥ 1536 MB) — "+(r.disk_ok?"✅ 通过":"❌ 不达标")+"\\n";'
	html[#html+1] = 'logEl.textContent+="\\n";'
	html[#html+1] = 'if(!r.pass){'
	html[#html+1] = 'ocCloseSetupDialog();'
	html[#html+1] = 'btn.disabled=false;btn.textContent="📦 安装运行环境";'
	html[#html+1] = 'statusEl.innerHTML="<span style=\\"color:#cf222e;\\">❌ 系统配置不满足要求</span>";'
	html[#html+1] = 'logEl.textContent+="❌ 系统配置不满足要求，安装已终止\\n";'
	html[#html+1] = 'logEl.textContent+="💡 请升级硬件配置或清理磁盘空间后重试\\n";'
	html[#html+1] = 'resultEl.style.display="block";'
	html[#html+1] = 'resultEl.innerHTML="<div style=\\"border:1px solid #f5c6cb;background:#ffeef0;padding:12px 16px;border-radius:6px;\\">"+'
	html[#html+1] = '"<strong style=\\"color:#cf222e;font-size:14px;\\">❌ 系统配置不满足要求</strong><br/>"+'
	html[#html+1] = '"<div style=\\"margin-top:8px;font-size:12px;color:#666;\\">💡 请升级硬件配置或清理磁盘空间后重试。</div></div>";'
	html[#html+1] = 'return;'
	html[#html+1] = '}'
	html[#html+1] = 'statusEl.innerHTML="<span style=\\"color:#7aa2f7;\\">⏳ 安装进行中...</span>";'
	html[#html+1] = 'logEl.textContent+="✅ 系统配置检测通过，开始安装...\\n\\n";'
	html[#html+1] = 'ocCloseSetupDialog();'
	html[#html+1] = 'var radios=document.getElementsByName("oc-ver-choice");'
	html[#html+1] = 'var choice="stable";'
	html[#html+1] = 'for(var i=0;i<radios.length;i++){if(radios[i].checked){choice=radios[i].value;break;}}'
	html[#html+1] = 'var verParam=(choice==="stable")?"stable":"latest";'
	html[#html+1] = 'ocSetup(verParam,r.memory_mb,r.disk_mb);'
	html[#html+1] = '}catch(e){'
	html[#html+1] = 'ocCloseSetupDialog();'
	html[#html+1] = 'btn.disabled=false;btn.textContent="📦 安装运行环境";'
	html[#html+1] = 'alert("系统检测失败，请重试");'
	html[#html+1] = '}});'
	html[#html+1] = '}'

	-- 安装运行环境 (带实时日志)
	html[#html+1] = 'function ocSetup(version,mem_mb,disk_mb){'
	html[#html+1] = 'var btn=document.getElementById("btn-setup");'
	html[#html+1] = 'var logEl=document.getElementById("setup-log-content");'
	html[#html+1] = 'btn.disabled=true;btn.textContent="⏳ 安装中...";'
	html[#html+1] = 'logEl.textContent+="════════════════════════════════════════\\n";'
	html[#html+1] = 'logEl.textContent+="📦 安装运行环境 ("+((version==="stable")?"稳定版":"最新版")+")\\n";'
	html[#html+1] = 'logEl.textContent+="════════════════════════════════════════\\n";'
	html[#html+1] = 'logEl.textContent+="正在启动安装...\\n";'
	html[#html+1] = '(new XHR()).get("' .. ctl_url .. '?action=setup&version="+encodeURIComponent(version),null,function(x){'
	html[#html+1] = 'try{JSON.parse(x.responseText);}catch(e){}'
	html[#html+1] = 'ocPollSetupLog();'
	html[#html+1] = '});'
	html[#html+1] = '}'

	-- 轮询安装日志
	html[#html+1] = 'var _lastLogLen=0;'
	html[#html+1] = 'function ocPollSetupLog(){'
	html[#html+1] = 'if(_setupTimer)clearInterval(_setupTimer);'
	html[#html+1] = '_lastLogLen=0;'
	html[#html+1] = '_setupTimer=setInterval(function(){'
	html[#html+1] = '(new XHR()).get("' .. log_url .. '",null,function(x){'
	html[#html+1] = 'try{'
	html[#html+1] = 'var r=JSON.parse(x.responseText);'
	html[#html+1] = 'var logEl=document.getElementById("setup-log-content");'
	html[#html+1] = 'var statusEl=document.getElementById("setup-log-status");'
	html[#html+1] = 'if(r.log&&r.log.length>_lastLogLen){'
	html[#html+1] = 'var newLog=r.log.substring(_lastLogLen);'
	html[#html+1] = 'logEl.textContent+=newLog;'
	html[#html+1] = '_lastLogLen=r.log.length;'
	html[#html+1] = '}'
	html[#html+1] = 'logEl.scrollTop=logEl.scrollHeight;'
	html[#html+1] = 'if(r.state==="running"){'
	html[#html+1] = 'statusEl.innerHTML="<span style=\\"color:#7aa2f7;\\">⏳ 安装进行中...</span>";'
	html[#html+1] = '}else if(r.state==="success"){'
	html[#html+1] = 'clearInterval(_setupTimer);_setupTimer=null;'
	html[#html+1] = 'ocSetupDone(true,logEl.textContent);'
	html[#html+1] = '}else if(r.state==="failed"){'
	html[#html+1] = 'clearInterval(_setupTimer);_setupTimer=null;'
	html[#html+1] = 'ocSetupDone(false,logEl.textContent);'
	html[#html+1] = '}'
	html[#html+1] = '}catch(e){}'
	html[#html+1] = '});'
	html[#html+1] = '},1500);'
	html[#html+1] = '}'

	-- 安装完成处理
	html[#html+1] = 'function ocSetupDone(ok,log){'
	html[#html+1] = 'var btn=document.getElementById("btn-setup");'
	html[#html+1] = 'var statusEl=document.getElementById("setup-log-status");'
	html[#html+1] = 'var resultEl=document.getElementById("setup-log-result");'
	html[#html+1] = 'btn.disabled=false;btn.textContent="📦 安装运行环境";'
	html[#html+1] = 'resultEl.style.display="block";'
	html[#html+1] = 'if(ok){'
	html[#html+1] = 'statusEl.innerHTML="<span style=\\"color:#1a7f37;\\">✅ 安装完成</span>";'
	html[#html+1] = 'resultEl.innerHTML="<div style=\\"border:1px solid #c6e9c9;background:#e6f7e9;padding:12px 16px;border-radius:6px;\\">"+'
	html[#html+1] = '"<strong style=\\"color:#1a7f37;font-size:14px;\\">🎉 恭喜！OpenClaw 运行环境安装成功！</strong><br/>"+'
	html[#html+1] = '"<span style=\\"color:#555;font-size:13px;line-height:1.8;\\">服务已自动启用并启动，点击下方按钮刷新页面查看运行状态。</span><br/>"+'
	html[#html+1] = '"<button class=\\"btn cbi-button cbi-button-apply\\" type=\\"button\\" onclick=\\"location.reload()\\" style=\\"margin-top:10px;\\">🔄 刷新页面</button></div>";'
	html[#html+1] = '}else{'
	html[#html+1] = 'statusEl.innerHTML="<span style=\\"color:#cf222e;\\">❌ 安装失败</span>";'
	-- 分析失败原因
	html[#html+1] = 'var reasons=ocAnalyzeFailure(log);'
	html[#html+1] = 'resultEl.innerHTML="<div style=\\"border:1px solid #f5c6cb;background:#ffeef0;padding:12px 16px;border-radius:6px;\\">"+'
	html[#html+1] = '"<strong style=\\"color:#cf222e;font-size:14px;\\">❌ 安装失败</strong><br/>"+'
	html[#html+1] = '"<div style=\\"margin:8px 0;padding:10px 14px;background:#fff5f5;border-radius:4px;font-size:13px;line-height:1.8;\\">"+'
	html[#html+1] = '"<strong>🔍 可能的失败原因：</strong><br/>"+reasons+"</div>"+'
	html[#html+1] = '"<div style=\\"margin-top:8px;font-size:12px;color:#666;\\">💡 完整日志见上方终端输出，也可在终端查看：<code>cat /tmp/openclaw-setup.log</code></div></div>";'
	html[#html+1] = '}'
	html[#html+1] = '}'

	-- 分析失败原因
	html[#html+1] = 'function ocAnalyzeFailure(log){'
	html[#html+1] = 'var reasons=[];'
	html[#html+1] = 'if(!log)return"未知错误，请检查日志。";'
	html[#html+1] = 'var ll=log.toLowerCase();'
	-- 网络问题
	html[#html+1] = 'if(ll.indexOf("could not resolve")>=0||ll.indexOf("connection timed out")>=0||ll.indexOf("curl")>=0&&ll.indexOf("fail")>=0||ll.indexOf("wget")>=0&&ll.indexOf("fail")>=0||ll.indexOf("所有镜像均下载失败")>=0){'
	html[#html+1] = 'reasons.push("🌐 <b>网络连接失败</b> — 无法下载 Node.js。请检查路由器是否能访问外网。<br/>&nbsp;&nbsp;💡 解决: 检查 DNS 设置和网络连接，或手动指定镜像: <code>NODE_MIRROR=https://npmmirror.com/mirrors/node openclaw-env setup</code>");'
	html[#html+1] = '}'
	-- 磁盘空间
	html[#html+1] = 'if(ll.indexOf("no space")>=0||ll.indexOf("disk full")>=0||ll.indexOf("enospc")>=0){'
	html[#html+1] = 'reasons.push("💾 <b>磁盘空间不足</b> — Node.js + OpenClaw 需要约 200MB 空间。<br/>&nbsp;&nbsp;💡 解决: 运行 <code>df -h</code> 检查可用空间，清理不需要的文件或使用外部存储。");'
	html[#html+1] = '}'
	-- 架构不支持
	html[#html+1] = 'if(ll.indexOf("不支持的 cpu 架构")>=0||ll.indexOf("不支持的架构")>=0){'
	html[#html+1] = 'reasons.push("🔧 <b>CPU 架构不支持</b> — 仅支持 x86_64 和 aarch64 (ARM64)。<br/>&nbsp;&nbsp;💡 当前设备架构可能是 32 位 ARM 或 MIPS，无法运行 Node.js 22。");'
	html[#html+1] = '}'
	-- npm 安装失败
	html[#html+1] = 'if(ll.indexOf("npm err")>=0||ll.indexOf("npm warn")>=0&&ll.indexOf("openclaw 安装验证失败")>=0){'
	html[#html+1] = 'reasons.push("📦 <b>npm 安装 OpenClaw 失败</b> — npm 包下载或安装出错。<br/>&nbsp;&nbsp;💡 解决: 尝试手动安装 <code>PATH=/opt/openclaw/node/bin:$PATH npm install -g openclaw@latest --prefix=/opt/openclaw/global</code>");'
	html[#html+1] = '}'
	-- 权限问题
	html[#html+1] = 'if(ll.indexOf("permission denied")>=0||ll.indexOf("eacces")>=0){'
	html[#html+1] = 'reasons.push("🔒 <b>权限不足</b> — 文件或目录权限问题。<br/>&nbsp;&nbsp;💡 解决: 运行 <code>chown -R openclaw:openclaw /opt/openclaw</code> 或以 root 用户重试。");'
	html[#html+1] = '}'
	-- tar 解压失败
	html[#html+1] = 'if(ll.indexOf("tar")>=0&&(ll.indexOf("error")>=0||ll.indexOf("fail")>=0)){'
	html[#html+1] = 'reasons.push("📂 <b>解压失败</b> — Node.js 安装包可能下载不完整。<br/>&nbsp;&nbsp;💡 解决: 删除缓存重试 <code>rm -rf /opt/openclaw/node && openclaw-env setup</code>");'
	html[#html+1] = '}'
	-- 验证失败
	html[#html+1] = 'if(ll.indexOf("安装验证失败")>=0){'
	html[#html+1] = 'reasons.push("⚠️ <b>安装验证失败</b> — 程序已下载但无法正常运行。<br/>&nbsp;&nbsp;💡 可能是 glibc/musl 不兼容，请确认系统 C 库类型: <code>ldd --version 2>&1 | head -1</code>");'
	html[#html+1] = '}'
	-- 兜底
	html[#html+1] = 'if(reasons.length===0){'
	html[#html+1] = 'reasons.push("⚠️ <b>未识别的错误</b> — 请查看上方完整日志分析具体原因。<br/>&nbsp;&nbsp;💡 您也可以尝试手动执行: <code>openclaw-env setup</code> 查看详细输出。");'
	html[#html+1] = '}'
	html[#html+1] = 'return reasons.join("<br/><br/>");'
	html[#html+1] = '}'

	-- 普通服务操作 (restart/stop)
	html[#html+1] = 'function ocServiceCtl(action){'
	html[#html+1] = 'var el=document.getElementById("action-result");'
	html[#html+1] = 'el.innerHTML="<span style=\\"color:#999\\">⏳ 正在执行...</span>";'
	html[#html+1] = '(new XHR()).get("' .. ctl_url .. '?action="+action,null,function(x){'
	html[#html+1] = 'try{var r=JSON.parse(x.responseText);'
	html[#html+1] = 'if(r.status==="ok"){el.innerHTML="<span style=\\"color:green\\">✅ "+action+" 已完成</span>";}'
	html[#html+1] = 'else{el.innerHTML="<span style=\\"color:red\\">❌ "+(r.message||"失败")+"</span>";}'
	html[#html+1] = '}catch(e){el.innerHTML="<span style=\\"color:red\\">❌ 错误</span>";}'
	html[#html+1] = '});}'

	-- 检测升级 (只检查插件版本，有新版本时显示更新内容)
	html[#html+1] = 'function ocCheckUpdate(){'
	html[#html+1] = 'var btn=document.getElementById("btn-check-update");'
	html[#html+1] = 'var el=document.getElementById("action-result");'
	html[#html+1] = 'var act=document.getElementById("oc-update-action");'
	html[#html+1] = 'btn.disabled=true;btn.textContent="⏳ 正在检测...";el.textContent="";act.style.display="none";'
	html[#html+1] = '(new XHR()).get("' .. check_url .. '",null,function(x){'
	html[#html+1] = 'btn.disabled=false;btn.textContent="🔍 检测升级";'
	html[#html+1] = 'var dot=document.getElementById("update-dot");if(dot)dot.style.display="none";'
	html[#html+1] = 'try{var r=JSON.parse(x.responseText);'
	html[#html+1] = 'var msgs=[];'
	-- 插件版本检查
	html[#html+1] = 'if(r.plugin_current){'
	html[#html+1] = 'if(r.plugin_has_update){msgs.push("<span style=\\"color:#e36209\\">🔌 插件: v"+r.plugin_current+" → v"+r.plugin_latest+" (有新版本)</span>");}'
	html[#html+1] = 'else if(r.plugin_latest){msgs.push("<span style=\\"color:green\\">✅ 插件: v"+r.plugin_current+" (已是最新)</span>");}'
	html[#html+1] = 'else{msgs.push("<span style=\\"color:#999\\">🔌 插件: v"+r.plugin_current+" (无法检查最新版本)</span>");}'
	html[#html+1] = '}'
	html[#html+1] = 'if(msgs.length===0)msgs.push("<span style=\\"color:#999\\">无法获取版本信息</span>");'
	html[#html+1] = 'el.innerHTML=msgs.join("<br/>");'
	-- 插件有更新时: release notes + 一键升级按钮 + GitHub 下载链接
	html[#html+1] = 'if(r.plugin_has_update){'
	html[#html+1] = 'act.style.display="block";'
	html[#html+1] = 'window._pluginLatestVer=r.plugin_latest;'
	html[#html+1] = 'var notesHtml="";'
	html[#html+1] = 'if(r.release_notes){'
	html[#html+1] = 'var escaped=r.release_notes.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");'
	html[#html+1] = 'notesHtml=\'<div style="margin:10px 0 8px;padding:10px 14px;background:#fffbf0;border:1px solid #f0c040;border-radius:6px;">\''
	html[#html+1] = '+\'<div style="font-size:12px;font-weight:600;color:#8a6a00;margin-bottom:6px;">📋 v\'+r.plugin_latest+\' 更新内容</div>\''
	html[#html+1] = '+\'<pre style="margin:0;font-size:12px;color:#444;white-space:pre-wrap;word-break:break-word;line-height:1.6;">\'+escaped+\'</pre>\''
	html[#html+1] = '+\'</div>\';'
	html[#html+1] = '}'
	html[#html+1] = 'act.innerHTML=notesHtml'
	html[#html+1] = '+\'<button class="btn cbi-button cbi-button-apply" type="button" onclick="ocPluginUpgrade()" id="btn-plugin-upgrade">⬆️ 升级插件 v\'+r.plugin_latest+\'</button>\''
	html[#html+1] = '+\' <a href="https://github.com/10000ge10000/luci-app-openclaw/releases/latest" target="_blank" rel="noopener" class="btn cbi-button cbi-button-action" style="text-decoration:none;">📥 手动下载</a>\';'
	html[#html+1] = '}'
	html[#html+1] = '}catch(e){el.innerHTML="<span style=\\"color:red\\">❌ 检测失败</span>";}'
	html[#html+1] = '});}'

	-- ═══ 插件一键升级 ═══
	html[#html+1] = 'var _pluginUpgradeTimer=null;'

	html[#html+1] = 'function ocPluginUpgrade(){'
	html[#html+1] = 'var ver=window._pluginLatestVer;'
	html[#html+1] = 'if(!ver){alert("无法获取最新版本号");return;}'
	html[#html+1] = 'if(!confirm("确定要升级插件到 v"+ver+"？\\n\\n升级会替换插件文件并清除 LuCI 缓存，不会影响正在运行的 OpenClaw 服务。"))return;'
	html[#html+1] = 'var btn=document.getElementById("btn-plugin-upgrade");'
	html[#html+1] = 'var panel=document.getElementById("setup-log-panel");'
	html[#html+1] = 'var logEl=document.getElementById("setup-log-content");'
	html[#html+1] = 'var titleEl=document.getElementById("setup-log-title");'
	html[#html+1] = 'var statusEl=document.getElementById("setup-log-status");'
	html[#html+1] = 'var resultEl=document.getElementById("setup-log-result");'
	html[#html+1] = 'btn.disabled=true;btn.textContent="⏳ 正在升级插件...";'
	html[#html+1] = 'panel.style.display="block";'
	html[#html+1] = 'logEl.textContent="正在启动插件升级...\\n";'
	html[#html+1] = 'titleEl.textContent="📋 插件升级日志";'
	html[#html+1] = 'statusEl.innerHTML="<span style=\\"color:#7aa2f7;\\">⏳ 插件升级中...</span>";'
	html[#html+1] = 'resultEl.style.display="none";'
	html[#html+1] = '(new XHR()).get("' .. plugin_upgrade_url .. '?version="+encodeURIComponent(ver),null,function(x){'
	html[#html+1] = 'try{JSON.parse(x.responseText);}catch(e){}'
	html[#html+1] = 'ocPollPluginUpgradeLog();'
	html[#html+1] = '});'
	html[#html+1] = '}'

	-- 轮询插件升级日志 (带容错: 安装时文件被替换可能导致API暂时不可用)
	html[#html+1] = 'var _pluginPollErrors=0;'
	html[#html+1] = 'function ocPollPluginUpgradeLog(){'
	html[#html+1] = 'if(_pluginUpgradeTimer)clearInterval(_pluginUpgradeTimer);'
	html[#html+1] = '_pluginPollErrors=0;'
	html[#html+1] = '_pluginUpgradeTimer=setInterval(function(){'
	html[#html+1] = '(new XHR()).get("' .. plugin_upgrade_log_url .. '",null,function(x){'
	html[#html+1] = 'try{'
	html[#html+1] = 'var r=JSON.parse(x.responseText);'
	html[#html+1] = '_pluginPollErrors=0;'
	html[#html+1] = 'var logEl=document.getElementById("setup-log-content");'
	html[#html+1] = 'var statusEl=document.getElementById("setup-log-status");'
	html[#html+1] = 'if(r.log)logEl.textContent=r.log;'
	html[#html+1] = 'logEl.scrollTop=logEl.scrollHeight;'
	html[#html+1] = 'if(r.state==="running"){'
	html[#html+1] = 'statusEl.innerHTML="<span style=\\"color:#7aa2f7;\\">⏳ 插件升级中...</span>";'
	html[#html+1] = '}else if(r.state==="success"){'
	html[#html+1] = 'clearInterval(_pluginUpgradeTimer);_pluginUpgradeTimer=null;'
	html[#html+1] = 'ocPluginUpgradeDone(true);'
	html[#html+1] = '}else if(r.state==="failed"){'
	html[#html+1] = 'clearInterval(_pluginUpgradeTimer);_pluginUpgradeTimer=null;'
	html[#html+1] = 'ocPluginUpgradeDone(false);'
	html[#html+1] = '}'
	html[#html+1] = '}catch(e){'
	html[#html+1] = '_pluginPollErrors++;'
	html[#html+1] = 'if(_pluginPollErrors>=8){'
	html[#html+1] = 'clearInterval(_pluginUpgradeTimer);_pluginUpgradeTimer=null;'
	html[#html+1] = 'ocPluginUpgradeDone(true);'
	html[#html+1] = '}'
	html[#html+1] = '}'
	html[#html+1] = '});'
	html[#html+1] = '},2000);'
	html[#html+1] = '}'

	-- 插件升级完成处理
	html[#html+1] = 'function ocPluginUpgradeDone(ok){'
	html[#html+1] = 'var btn=document.getElementById("btn-plugin-upgrade");'
	html[#html+1] = 'var statusEl=document.getElementById("setup-log-status");'
	html[#html+1] = 'var resultEl=document.getElementById("setup-log-result");'
	html[#html+1] = 'if(btn){btn.disabled=false;btn.textContent="⬆️ 升级插件";}'
	html[#html+1] = 'resultEl.style.display="block";'
	html[#html+1] = 'if(ok){'
	html[#html+1] = 'statusEl.innerHTML="<span style=\\"color:#1a7f37;\\">✅ 插件升级完成</span>";'
	html[#html+1] = 'resultEl.innerHTML="<div style=\\"border:1px solid #c6e9c9;background:#e6f7e9;padding:12px 16px;border-radius:6px;\\">"+'
	html[#html+1] = '"<strong style=\\"color:#1a7f37;font-size:14px;\\">🎉 插件升级成功！</strong><br/>"+'
	html[#html+1] = '"<span style=\\"color:#555;font-size:13px;line-height:1.8;\\">插件文件已更新，OpenClaw 服务不受影响。请刷新页面加载新版界面。</span><br/>"+'
	html[#html+1] = '"<button class=\\"btn cbi-button cbi-button-apply\\" type=\\"button\\" onclick=\\"location.reload()\\" style=\\"margin-top:10px;\\">🔄 刷新页面</button></div>";'
	html[#html+1] = '}else{'
	html[#html+1] = 'statusEl.innerHTML="<span style=\\"color:#cf222e;\\">❌ 插件升级失败</span>";'
	html[#html+1] = 'resultEl.innerHTML="<div style=\\"border:1px solid #f5c6cb;background:#ffeef0;padding:12px 16px;border-radius:6px;\\">"+'
	html[#html+1] = '"<strong style=\\"color:#cf222e;font-size:14px;\\">❌ 插件升级失败</strong><br/>"+'
	html[#html+1] = '"<span style=\\"color:#555;font-size:13px;\\">请查看上方日志了解详情。也可手动执行：<code>cat /tmp/openclaw-plugin-upgrade.log</code></span><br/>"+'
	html[#html+1] = '"<button class=\\"btn cbi-button cbi-button-apply\\" type=\\"button\\" onclick=\\"location.reload()\\" style=\\"margin-top:10px;\\">🔄 刷新页面</button></div>";'
	html[#html+1] = '}'
	html[#html+1] = '}'

	-- 卸载运行环境
	html[#html+1] = 'function ocUninstall(){'
	html[#html+1] = 'if(!confirm("确定要卸载 OpenClaw 运行环境？\\n\\n将删除 Node.js、OpenClaw 程序及配置数据（/opt/openclaw 目录），服务将停止运行。\\n\\n插件本身不会被删除，之后可重新安装运行环境。"))return;'
	html[#html+1] = 'var btn=document.getElementById("btn-uninstall");'
	html[#html+1] = 'var el=document.getElementById("action-result");'
	html[#html+1] = 'btn.disabled=true;btn.textContent="⏳ 正在卸载...";'
	html[#html+1] = 'el.innerHTML="<span style=\\"color:#999\\">正在停止服务并清理文件...</span>";'
	html[#html+1] = '(new XHR()).get("' .. uninstall_url .. '",null,function(x){'
	html[#html+1] = 'btn.disabled=false;btn.textContent="🗑️ 卸载环境";'
	html[#html+1] = 'try{var r=JSON.parse(x.responseText);'
	html[#html+1] = 'if(r.status==="ok"){'
	html[#html+1] = 'el.innerHTML="<div style=\\"border:1px solid #d0d7de;background:#f6f8fa;padding:12px 16px;border-radius:6px;\\">"+'
	html[#html+1] = '"<strong style=\\"color:#1a7f37;\\">✅ 卸载完成</strong><br/>"+'
	html[#html+1] = '"<span style=\\"color:#555;font-size:13px;\\">"+r.message+"</span><br/>"+'
	html[#html+1] = '"<button class=\\"btn cbi-button cbi-button-apply\\" type=\\"button\\" onclick=\\"location.reload()\\" style=\\"margin-top:8px;\\">🔄 刷新页面</button></div>";'
	html[#html+1] = '}else{el.innerHTML="<span style=\\"color:red\\">❌ "+(r.message||"卸载失败")+"</span>";}'
	html[#html+1] = '}catch(e){el.innerHTML="<span style=\\"color:red\\">❌ 请求失败</span>";}'
	html[#html+1] = '});}'

	-- ═══ 备份/恢复 对话框 + 功能 (v2026.3.8+ openclaw backup) ═══
	local backup_url = luci.dispatcher.build_url("admin", "services", "openclaw", "backup")
	-- 先关闭 script，插入对话框 HTML，再重新打开 script
	html[#html+1] = '</script>'
	-- 对话框 HTML (附加到按钮区域后面)
	html[#html+1] = '<div id="oc-backup-dialog" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;align-items:center;justify-content:center;">'
	html[#html+1] = '<div style="background:#fff;border-radius:12px;padding:24px 28px;max-width:520px;width:92%;box-shadow:0 8px 32px rgba(0,0,0,0.2);">'
	html[#html+1] = '<h3 style="margin:0 0 16px 0;font-size:16px;color:#333;">💾 备份 / 恢复配置</h3>'
	-- 备份操作区
	html[#html+1] = '<div style="margin-bottom:16px;">'
	html[#html+1] = '<div style="font-weight:600;font-size:13px;color:#555;margin-bottom:8px;">📤 创建备份</div>'
	html[#html+1] = '<div style="display:flex;gap:10px;">'
	html[#html+1] = '<button class="btn cbi-button cbi-button-apply" type="button" onclick="ocDoBackup(1)" id="btn-bk-config" style="font-size:12px;">📄 仅配置文件</button>'
	html[#html+1] = '<button class="btn cbi-button cbi-button-action" type="button" onclick="ocDoBackup(0)" id="btn-bk-full" style="font-size:12px;">📦 配置 + 状态数据</button>'
	html[#html+1] = '</div>'
	html[#html+1] = '<div style="font-size:11px;color:#888;margin-top:6px;">仅配置文件 (~2KB) 包含模型、渠道、插件设置；完整备份含会话历史等状态数据（可能较大）</div>'
	html[#html+1] = '</div>'
	-- 备份列表区（恢复/删除在这里动态渲染）
	html[#html+1] = '<div style="border-top:1px solid #eee;padding-top:14px;margin-bottom:16px;">'
	html[#html+1] = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">'
	html[#html+1] = '<div style="font-weight:600;font-size:13px;color:#555;">📥 现有备份</div>'
	html[#html+1] = '<button class="btn cbi-button" type="button" onclick="ocLoadBackupList()" style="font-size:11px;padding:2px 10px;">🔄 刷新</button>'
	html[#html+1] = '</div>'
	html[#html+1] = '<div id="oc-backup-list" style="max-height:260px;overflow-y:auto;"></div>'
	html[#html+1] = '</div>'
	-- 操作结果提示区
	html[#html+1] = '<div id="oc-backup-result" style="margin-bottom:14px;display:none;"></div>'
	-- 关闭按钮
	html[#html+1] = '<div style="display:flex;justify-content:flex-end;">'
	html[#html+1] = '<button class="btn cbi-button" type="button" onclick="document.getElementById(\'oc-backup-dialog\').style.display=\'none\';" style="min-width:80px;">关闭</button>'
	html[#html+1] = '</div>'
	html[#html+1] = '</div></div>'

	-- 重新打开 script 继续 JS 函数
	html[#html+1] = '<script type="text/javascript">'

	-- 打开备份/恢复对话框并加载列表
	html[#html+1] = 'function ocBackupRestore(){'
	html[#html+1] = 'var dlg=document.getElementById("oc-backup-dialog");'
	html[#html+1] = 'dlg.style.display="flex";'
	html[#html+1] = 'document.getElementById("oc-backup-result").style.display="none";'
	html[#html+1] = 'ocLoadBackupList();'
	html[#html+1] = '}'

	-- 加载备份文件列表
	html[#html+1] = 'function ocLoadBackupList(){'
	html[#html+1] = 'var el=document.getElementById("oc-backup-list");'
	html[#html+1] = 'el.innerHTML="<div style=\\"color:#7aa2f7;font-size:12px;padding:8px;\\">⏳ 加载备份列表...</div>";'
	html[#html+1] = '(new XHR()).get("' .. backup_url .. '?action=list",null,function(x){'
	html[#html+1] = 'try{var r=JSON.parse(x.responseText);'
	html[#html+1] = 'if(r.status==="ok"&&r.backups&&r.backups.length>0){'
	html[#html+1] = 'var h="<table style=\\"width:100%;border-collapse:collapse;font-size:12px;\\">";'
	html[#html+1] = 'h+="<tr style=\\"background:#f6f8fa;border-bottom:2px solid #d0d7de;\\">"+'
	html[#html+1] = '"<th style=\\"padding:6px 8px;text-align:left;\\">类型</th>"+'
	html[#html+1] = '"<th style=\\"padding:6px 8px;text-align:left;\\">备份时间</th>"+'
	html[#html+1] = '"<th style=\\"padding:6px 8px;text-align:right;\\">大小</th>"+'
	html[#html+1] = '"<th style=\\"padding:6px 8px;text-align:center;\\">操作</th></tr>";'
	html[#html+1] = 'for(var i=0;i<r.backups.length;i++){'
	html[#html+1] = 'var b=r.backups[i];'
	html[#html+1] = 'var typeBadge=b.backup_type==="config"?'
	html[#html+1] = '"<span style=\\"background:#ddf4ff;color:#0969da;padding:2px 6px;border-radius:3px;font-size:11px;white-space:nowrap;\\">📄 仅配置</span>":'
	html[#html+1] = '"<span style=\\"background:#fff8c5;color:#9a6700;padding:2px 6px;border-radius:3px;font-size:11px;white-space:nowrap;\\">📦 完整备份</span>";'
	html[#html+1] = 'var rowBg=i%2===0?"#fff":"#f6f8fa";'
	html[#html+1] = 'h+="<tr style=\\"border-bottom:1px solid #eee;background:"+rowBg+";\\">"+' -- 行开始
	html[#html+1] = '"<td style=\\"padding:7px 8px;\\">"+typeBadge+"</td>"+' -- 类型
	html[#html+1] = '"<td style=\\"padding:7px 8px;color:#555;white-space:nowrap;\\">"+b.time+"</td>"+' -- 时间
	html[#html+1] = '"<td style=\\"padding:7px 8px;text-align:right;color:#666;white-space:nowrap;\\">"+b.size_str+"</td>"+' -- 大小
	html[#html+1] = '"<td style=\\"padding:5px 8px;text-align:center;white-space:nowrap;\\">"+'
	html[#html+1] = '"<button class=\\"btn cbi-button cbi-button-action\\" style=\\"font-size:11px;padding:1px 8px;margin-right:4px;\\" onclick=\\"ocRestoreBackup(\\x27"+b.filename+"\\x27)\\">恢复</button>"+'
	html[#html+1] = '"<button class=\\"btn cbi-button cbi-button-remove\\" style=\\"font-size:11px;padding:1px 8px;\\" onclick=\\"ocDeleteBackup(\\x27"+b.filename+"\\x27)\\">删除</button>"+'
	html[#html+1] = '"</td></tr>";'
	html[#html+1] = '}'
	html[#html+1] = 'h+="</table>";'
	html[#html+1] = 'el.innerHTML=h;'
	html[#html+1] = '}else if(r.status==="ok"){'
	html[#html+1] = 'el.innerHTML="<div style=\\"color:#888;font-size:12px;padding:8px;text-align:center;\\">暂无备份，请先创建备份</div>";'
	html[#html+1] = '}else{'
	html[#html+1] = 'el.innerHTML="<div style=\\"color:#e36209;font-size:12px;padding:8px;\\">⚠️ "+(r.message||"获取列表失败")+"</div>";'
	html[#html+1] = '}'
	html[#html+1] = '}catch(e){el.innerHTML="<div style=\\"color:#e36209;font-size:12px;padding:8px;\\">⚠️ 无法加载列表</div>";}'
	html[#html+1] = '});}'

	-- 创建备份（创建完成后刷新列表）
	html[#html+1] = 'function ocDoBackup(onlyConfig){'
	html[#html+1] = 'var resEl=document.getElementById("oc-backup-result");'
	html[#html+1] = 'var btnC=document.getElementById("btn-bk-config");'
	html[#html+1] = 'var btnF=document.getElementById("btn-bk-full");'
	html[#html+1] = 'btnC.disabled=true;btnF.disabled=true;'
	html[#html+1] = 'resEl.style.display="block";'
	html[#html+1] = 'resEl.innerHTML="<div style=\\"color:#7aa2f7;font-size:12px;padding:8px;\\">⏳ 正在创建备份..."+(onlyConfig?"（仅配置）":"（完整备份，可能需要较长时间）")+"</div>";'
	html[#html+1] = '(new XHR()).get("' .. backup_url .. '?action=create&only_config="+onlyConfig,null,function(x){'
	html[#html+1] = 'btnC.disabled=false;btnF.disabled=false;'
	html[#html+1] = 'try{var r=JSON.parse(x.responseText);'
	html[#html+1] = 'if(r.status==="ok"){'
	html[#html+1] = 'resEl.innerHTML="<div style=\\"border:1px solid #c6e9c9;background:#e6f7e9;padding:10px 14px;border-radius:6px;font-size:12px;\\">"+'
	html[#html+1] = '"<strong style=\\"color:#1a7f37;\\">✅ 备份完成</strong></div>";'
	html[#html+1] = 'ocLoadBackupList();'
	html[#html+1] = '}else{'
	html[#html+1] = 'resEl.innerHTML="<div style=\\"color:#e36209;font-size:12px;padding:8px;\\">⚠️ "+(r.message||"备份失败")+"</div>";'
	html[#html+1] = '}'
	html[#html+1] = '}catch(e){resEl.innerHTML="<div style=\\"color:#e36209;font-size:12px;padding:8px;\\">⚠️ 备份功能需要 OpenClaw v2026.3.8+</div>";}'
	html[#html+1] = '});}'

	-- 恢复指定备份
	html[#html+1] = 'function ocRestoreBackup(filename){'
	html[#html+1] = 'if(!confirm("确定要从此备份恢复配置？\\n\\n"+filename+"\\n\\n当前 openclaw.json 将被备份中的版本覆盖，服务将自动重启。"))return;'
	html[#html+1] = 'var resEl=document.getElementById("oc-backup-result");'
	html[#html+1] = 'resEl.style.display="block";'
	html[#html+1] = 'resEl.innerHTML="<div style=\\"color:#7aa2f7;font-size:12px;padding:8px;\\">⏳ 正在恢复配置...</div>";'
	html[#html+1] = '(new XHR()).get("' .. backup_url .. '?action=restore&file="+encodeURIComponent(filename),null,function(x){'
	html[#html+1] = 'try{var r=JSON.parse(x.responseText);'
	html[#html+1] = 'if(r.status==="ok"){'
	html[#html+1] = 'resEl.innerHTML="<div style=\\"border:1px solid #c6e9c9;background:#e6f7e9;padding:10px 14px;border-radius:6px;font-size:12px;\\">"+'
	html[#html+1] = '"<strong style=\\"color:#1a7f37;\\">✅ 配置已恢复</strong><br/>"+'
	html[#html+1] = '"<span style=\\"color:#555;\\">"+r.message+"</span><br/>"+'
	html[#html+1] = '"<button class=\\"btn cbi-button cbi-button-apply\\" type=\\"button\\" onclick=\\"location.reload()\\" style=\\"margin-top:6px;font-size:12px;\\">🔄 刷新页面</button></div>";'
	html[#html+1] = '}else{'
	html[#html+1] = 'resEl.innerHTML="<div style=\\"color:#cf222e;font-size:12px;padding:8px;\\">❌ "+(r.message||"恢复失败")+"</div>";'
	html[#html+1] = '}'
	html[#html+1] = '}catch(e){resEl.innerHTML="<div style=\\"color:#cf222e;font-size:12px;padding:8px;\\">❌ 恢复失败，请检查日志</div>";}'
	html[#html+1] = '});}'

	-- 删除指定备份
	html[#html+1] = 'function ocDeleteBackup(filename){'
	html[#html+1] = 'if(!confirm("确定要删除此备份？\\n\\n"+filename+"\\n\\n删除后无法恢复。"))return;'
	html[#html+1] = 'var resEl=document.getElementById("oc-backup-result");'
	html[#html+1] = 'resEl.style.display="block";'
	html[#html+1] = 'resEl.innerHTML="<div style=\\"color:#7aa2f7;font-size:12px;padding:8px;\\">⏳ 正在删除...</div>";'
	html[#html+1] = '(new XHR()).get("' .. backup_url .. '?action=delete&file="+encodeURIComponent(filename),null,function(x){'
	html[#html+1] = 'try{var r=JSON.parse(x.responseText);'
	html[#html+1] = 'if(r.status==="ok"){'
	html[#html+1] = 'resEl.innerHTML="<div style=\\"border:1px solid #c6e9c9;background:#e6f7e9;padding:10px 14px;border-radius:6px;font-size:12px;\\">"+'
	html[#html+1] = '"<strong style=\\"color:#1a7f37;\\">✅ "+r.message+"</strong></div>";'
	html[#html+1] = 'ocLoadBackupList();'
	html[#html+1] = '}else{'
	html[#html+1] = 'resEl.innerHTML="<div style=\\"color:#cf222e;font-size:12px;padding:8px;\\">❌ "+(r.message||"删除失败")+"</div>";'
	html[#html+1] = '}'
	html[#html+1] = '}catch(e){resEl.innerHTML="<div style=\\"color:#cf222e;font-size:12px;padding:8px;\\">❌ 删除失败</div>";}'
	html[#html+1] = '});}'

	-- 页面加载时静默检查是否有更新 (仅显示小红点提示)
	html[#html+1] = '(function(){'
	html[#html+1] = 'setTimeout(function(){'
	html[#html+1] = '(new XHR()).get("' .. check_url .. '",null,function(x){'
	html[#html+1] = 'try{var r=JSON.parse(x.responseText);'
	html[#html+1] = 'if(r.plugin_has_update){'
	html[#html+1] = 'var dot=document.getElementById("update-dot");'
	html[#html+1] = 'if(dot)dot.style.display="block";'
	html[#html+1] = '}'
	html[#html+1] = '}catch(e){}'
	html[#html+1] = '});'
	html[#html+1] = '},2000);'
	html[#html+1] = '})();'

	html[#html+1] = '</script>'
	return table.concat(html, "\n")
end

-- ═══════════════════════════════════════════
-- 使用指南
-- ═══════════════════════════════════════════
s4 = m:section(SimpleSection, nil)
s4.template = "cbi/nullsection"
guide = s4:option(DummyValue, "_guide")
guide.rawhtml = true
guide.cfgvalue = function()
	local html = {}
	html[#html+1] = '<div style="border:1px solid #d0e8ff;background:#f0f7ff;padding:14px 18px;border-radius:6px;margin-top:12px;line-height:1.8;font-size:13px;">'
	html[#html+1] = '<strong style="font-size:14px;">📖 使用指南</strong><br/>'
	html[#html+1] = '<span style="color:#555;">'
	html[#html+1] = '① 首次使用请点击 <b>「安装运行环境」</b>，安装完成后服务会自动启动<br/>'
	html[#html+1] = '② 进入 <b>「配置管理」</b> 使用交互式向导快速配置 AI 模型和 API Key<br/>'
	html[#html+1] = '③ 进入 <b>「Web 控制台」</b> 配置消息渠道，直接开始对话</span>'
	html[#html+1] = '<div style="margin-top:10px;padding-top:10px;border-top:1px solid #d0e8ff;">'
	html[#html+1] = '<span style="color:#888;">有疑问？请关注B站并留言：</span>'
	html[#html+1] = '<a href="https://space.bilibili.com/59438380" target="_blank" rel="noopener" style="color:#00a1d6;font-weight:bold;text-decoration:none;">'
	html[#html+1] = '🔗 space.bilibili.com/59438380</a>'
	html[#html+1] = '<span style="margin-left:16px;color:#888;">GitHub 项目：</span>'
	html[#html+1] = '<a href="https://github.com/10000ge10000/luci-app-openclaw" target="_blank" rel="noopener" style="color:#24292f;font-weight:bold;text-decoration:none;">'
	html[#html+1] = '🐙 10000ge10000/luci-app-openclaw</a></div></div>'
	return table.concat(html, "\n")
end

return m
