'use strict';
/* Liquid theme: save theme config (mode / accent / bing) directly.
   Called via XHR POST to /cgi-bin/luci/admin/system/liquid/save_config
   (like luci-app-pushbot's save_config), bypassing the uci rpc which is
   unreliable across LuCI versions. Writes /etc/config/liquid with fs
   (system()/uci CLI are not available in the ucode dispatcher sandbox). */

import * as fs from 'fs';
import { popen } from 'fs';

return {
	act_version: function() {
		let ver = "";
		/* mtime 校验 + /tmp 缓存（与 header/footer 模板同一套机制），避免每次 fork */
		let db_file = '/lib/apk/db/installed';
		let db_mtime = 0;
		let st = fs.stat(db_file);
		if (st && st.type == 'file') {
			db_mtime = st.mtime;
		} else {
			db_file = '/usr/lib/opkg/status';
			st = fs.stat(db_file);
			if (st && st.type == 'file')
				db_mtime = st.mtime;
		}
		if (db_mtime > 0) {
			let cm = match(fs.readfile('/tmp/liquid-version.cache') ?? '', /^(\d+) (.*)$/);
			if (cm !== null && sprintf('%d', db_mtime) == cm[1])
				ver = cm[2];
		}
		if (ver == "") {
			/* apk (OpenWrt 24.10+): /lib/apk/db/installed */
			let f = popen("awk '/^P:luci-theme-liquid$/{f=1;next} f&&/^V:/{print substr($0,3);exit}' " + db_file + " 2>/dev/null", "r");
			if (f) { ver = replace(f.read("all"), /\s+/, ""); f.close(); }
			/* opkg (legacy): /usr/lib/opkg/status */
			if (ver == "") {
				f = popen("awk '/^Package: luci-theme-liquid$/{f=1;next} f&&/^Version:/{print $2;exit}' /usr/lib/opkg/status 2>/dev/null", "r");
				if (f) { ver = replace(f.read("all"), /\s+/, ""); f.close(); }
			}
			if (ver != "" && db_mtime > 0)
				fs.writefile('/tmp/liquid-version.cache', sprintf('%d %s', db_mtime, ver));
		}
		http.prepare_content("application/json");
		http.write_json({ version: ver });
	},

	act_save_config: function() {
		http.prepare_content("application/json");

		let body;
		try { body = http.content(); } catch { body = null; }
		if (!body) {
			http.write_json({ ok: false, error: "no data" });
			return;
		}

		let data;
		try { data = json(body); } catch { data = null; }
		if (type(data) != 'object') {
			http.write_json({ ok: false, error: "invalid json" });
			return;
		}

		/* 白名单字段 + 值校验 */
		let writes = {};
		for (let k in data) {
			let v = sprintf("%s", data[k]);
			if (k == 'mode' && match(v, /^(light|dark|auto)$/))
				writes['mode'] = v;
			else if (k == 'accent' && match(v, /^(blue|magenta|amber|purple|lime|custom)$/))
				writes['accent'] = v;
			else if (k == 'accent_custom' && match(v, /^#[0-9a-fA-F]{6}$/))
				writes['accent_custom'] = v;
			else if (k == 'bing' && match(v, /^(0|1)$/))
				writes['bing'] = v;
			else if (k == 'glass_opacity') {
				let n = int(v, 10);
				if (n >= 0 && n <= 100)
					writes['glass_opacity'] = sprintf('%d', n);
			}
		}

		let cfg_path = '/etc/config/liquid';
		let cfg = fs.readfile(cfg_path) ?? '';
		let lines = split(cfg, '\n');
		let out = [];
		if (!match(cfg, /config theme/))
			push(out, "config theme 'theme'");

		let inSection = false;
		for (let i = 0; i < length(lines); i++) {
			let line = lines[i];
			if (match(line, /^config/))
				inSection = true;
			let m = match(line, /^[ \t]*option[ \t]+([a-z_]+)[ \t]+/);
			if (inSection && m !== null && m[1] in writes) {
				push(out, sprintf("\toption %s '%s'", m[1], writes[m[1]]));
				delete writes[m[1]];
				continue;
			}
			/* 丢弃纯空行（避免历史累积空行污染） */
			if (trim(line) == '')
				continue;
			push(out, line);
		}

		/* 追加尚未出现的 option */
		for (let k in writes)
			push(out, sprintf("\toption %s '%s'", k, writes[k]));

		fs.writefile(cfg_path, join('\n', out) + '\n');
		http.write_json({ ok: true, saved: true });
	},

	/* ── OTA: detect package manager (apk vs opkg)，与 pushbot 同款 ── */
	act_detect_pkgmgr: function() {
		let mgr = "opkg";
		let f = popen("command -v apk 2>/dev/null", "r");
		if (f) { let o = f.read("all"); f.close(); if (o && length(replace(o, /\s+/, "")) > 0) mgr = "apk"; }
		http.prepare_content("application/json");
		http.write_json({ pkgmgr: mgr });
	},

	/* ── OTA: 后台下载 Release 包（tag 方案 luci-theme-liquid-vX.Y-rN），与 pushbot 同款重试逻辑 ── */
	act_ota_download: function() {
		let ver = http.formvalue("ver") ?? "";
		let rel = http.formvalue("rel") ?? "";
		if (ver == "" || rel == "") {
			http.prepare_content("application/json");
			http.write_json({ ok: false, error: "missing ver/rel" });
			return;
		}
		/* 防注入：只放行数字与点 */
		ver = replace(ver, /[^0-9.]/g, "");
		rel = replace(rel, /[^0-9]/g, "");
		if (ver == "" || rel == "") {
			http.prepare_content("application/json");
			http.write_json({ ok: false, error: "invalid ver/rel" });
			return;
		}

		/* 检测包管理器 */
		let mgr = "opkg";
		let f0 = popen("command -v apk 2>/dev/null", "r");
		if (f0) { let o = f0.read("all"); f0.close(); if (o && length(replace(o, /\s+/, "")) > 0) mgr = "apk"; }

		/* 组装下载地址（主题无 po/i18n 子包，单文件） */
		let base = "https://github.com/zzsj0928/luci-theme-liquid/releases/download/luci-theme-liquid-v" + ver + "-r" + rel + "/";
		let files;
		if (mgr == "apk") {
			files = ["luci-theme-liquid-" + ver + "-r" + rel + ".apk"];
		} else {
			files = ["luci-theme-liquid_" + ver + "-r" + rel + "_all.ipk"];
		}

		/* 进度文件 */
		let pfile = "/tmp/liquid/ota_progress";
		system("mkdir -p /tmp/liquid && echo '0' > " + pfile + " 2>/dev/null");

		/* 后台下载脚本：每个文件最多重试 3 次，>10KB 视为有效 */
		let dl_script = "#!/bin/sh\n"
			+ "PFILE='" + pfile + "'\n"
			+ "BASE='" + base + "'\n"
			+ "MAX_RETRY=3\n"
			+ "TOTAL=" + length(files) + "\n"
			+ "OK=0\n"
			+ "for f in " + join(" ", files) + "; do\n"
			+ "  URL=\"${BASE}${f}\"\n"
			+ "  DEST=\"/tmp/${f}\"\n"
			+ "  ATTEMPT=0\n"
			+ "  while [ $ATTEMPT -lt $MAX_RETRY ]; do\n"
			+ "    ATTEMPT=$((ATTEMPT+1))\n"
			+ "    curl -k -Lf --connect-timeout 15 --max-time 120 -o \"${DEST}\" \"${URL}\" 2>/dev/null\n"
			+ "    if [ $? -eq 0 ] && [ -s \"${DEST}\" ] && [ $(wc -c < \"${DEST}\") -gt 10000 ]; then\n"
			+ "      OK=$((OK+1))\n"
			+ "      echo \"$((OK * 100 / TOTAL))\" > \"${PFILE}\"\n"
			+ "      [ $OK -lt $TOTAL ] && sleep 1\n"
			+ "      break\n"
			+ "    fi\n"
			+ "    rm -f \"${DEST}\"\n"
			+ "    sleep 2\n"
			+ "  done\n"
			+ "done\n"
			+ "if [ $OK -eq $TOTAL ]; then\n"
			+ "  sleep 1\n"
			+ "  echo 'done' > \"${PFILE}\"\n"
			+ "else\n"
			+ "  echo 'fail' > \"${PFILE}\"\n"
			+ "fi\n";

		fs.writefile("/tmp/liquid/ota_download.sh", dl_script);
		system("chmod +x /tmp/liquid/ota_download.sh && /tmp/liquid/ota_download.sh &");

		http.prepare_content("application/json");
		http.write_json({ ok: true });
	},

	/* ── OTA: 轮询下载进度（0-100 / done / fail） ── */
	act_ota_download_progress: function() {
		let pfile = "/tmp/liquid/ota_progress";
		let progress = "0";
		let f = popen("cat " + pfile + " 2>/dev/null || echo '0'", "r");
		if (f) { progress = replace(f.read("all"), /\s+/, ""); f.close(); }
		if (progress == "") progress = "0";
		http.prepare_content("application/json");
		http.write_json({ progress: progress });
	},

	/* ── OTA: 安装已下载的包（apk/opkg 双支持） ── */
	act_ota_install: function() {
		let mgr = "opkg";
		let f0 = popen("command -v apk 2>/dev/null", "r");
		if (f0) { let o = f0.read("all"); f0.close(); if (o && length(replace(o, /\s+/, "")) > 0) mgr = "apk"; }

		let ifile = "/tmp/liquid/ota_install.log";
		let trust = "";
		let cmd;
		if (mgr == "apk") {
			/* 装前检测 Zed 自签公钥：无则写入（添加不覆盖），随后安装
			   免 --allow-untrusted（老设备/新用户首次走 OTA 时设备上还没
			   有公钥，靠这步建立信任；包内也带同一公钥
			   root/etc/apk/keys/zed-openwrt-apk.pem，装完即常驻信任列表，
			   仅装本主题的用户同样获得信任）。 */
			trust = "[ -f /etc/apk/keys/zed-openwrt-apk.pem ] || { mkdir -p /etc/apk/keys; "
				+ "printf '%s" + "\\n" + "' '-----BEGIN PUBLIC KEY-----' "
				+ "'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE16+nzzY9Lx5wvzZoWs/18vZxsNZD' "
				+ "'jv+CqECJLUj+fA7J228Iu13DVUO8CK9jQyLHtqkw0f4/X2bKLlLiz281zQ==' "
				+ "'-----END PUBLIC KEY-----' > /etc/apk/keys/zed-openwrt-apk.pem; }; ";
			cmd = "apk add /tmp/luci-theme-liquid-*.apk";
		} else {
			/* opkg 同版本会 up to date 跳过，需 --force-reinstall 覆盖 */
			cmd = "opkg install --force-reinstall /tmp/luci-theme-liquid_*.ipk";
		}
		/* 后台安装 + 结果标记（postinst 自动清 luci 缓存并 reload rpcd）。
		   world 哈希锁清理【装前 + 装后各一次】：
		   - 装前：即使安装链中途被杀（重启/OOM），锁也已经清掉，
		     不会留下"中毒 world 卡死后续所有 apk 事务"的状态
		   - 装后：本次安装(本地文件)自己又会写一把新锁，再清一次
		   降级为裸包名（语义等价"保持安装"，且这些包不在官方源、
		   无被替换风险）。
		   整链必须放进单个 ( ... ) & 后台执行：否则 system() 会同步
		   等安装结束，阻塞 rpcd 处理器（全站请求卡住）。 */
		let heal = "[ -f /etc/apk/world ] && sed -i '/></ s/>.*$//' /etc/apk/world; ";
		let install_cmd = "( "
			+ trust
			+ heal
			+ cmd + " > " + ifile + " 2>&1; "
			+ "RC=$?; "
			+ heal
			+ "if [ $RC -eq 0 ]; then echo 'ok' >> " + ifile + "; "
			+ "else echo 'fail' >> " + ifile + "; fi ) &";
		system("mkdir -p /tmp/liquid && " + install_cmd);

		http.prepare_content("application/json");
		http.write_json({ ok: true, pkgmgr: mgr });
	},

	/* ── OTA: 清理已下载的包与进度文件 ── */
	act_ota_clear: function() {
		let patterns = [
			"/tmp/luci-theme-liquid-*.apk",
			"/tmp/luci-theme-liquid_*.ipk",
			"/tmp/liquid/ota_progress",
			"/tmp/liquid/ota_install.log",
			"/tmp/liquid/ota_download.sh"
		];
		system("rm -f " + join(" ", patterns) + " 2>/dev/null");
		http.prepare_content("application/json");
		http.write_json({ ok: true });
	}
};
