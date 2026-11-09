'use strict';

/* Liquid glass theme — light / dark / auto mode switch.
 *
 * The switch is injected right before the native LuCI refresh / poll
 * indicator area (#indicators) in the top bar. On the lock screen
 * (sysauth, which has no top bar) it is rendered as a fixed button in
 * the top right corner instead.
 *
 * Modes are persisted in localStorage under "liquid-theme-mode" and the
 * effective dark state is reflected on <html data-darkmode="true|false">.
 */

(function () {
	if (typeof L == 'undefined' || typeof L.media != 'function')
		return;

	var MODE_KEY = 'liquid-theme-mode';

	/* 主题配置写入 uci /etc/config/liquid（换客户端仍保留）：
	   - 用 LuCI 官方 uci 实例（uci.load + uci.set + uci.save），
	     跨 luci 版本最兼容（L.bind 手拼 RPC 在其他固件上不可靠）；
	     uci.save 直接写盘，不经过 ui.changes → 无待应用项、
	     不弹"保存更改"询问，改动立即生效
	   - 锁屏（登录页，未认证）不允许修改配置：只做本地预览
	     （localStorage），登录后刷新才真正持久化 */
	/* 一次 POST 全部 option（对象 {option: value}），后端一次写盘，
	   避免多次请求并发时后写覆盖先写（accent 与 accent_custom 一起存） */
	function saveConfig(opts) {
		if (!document.body)
			return;
		/* 登录页：暂存到 sessionStorage，不发任何请求 */
		if (document.body.classList.contains('liquid-login')) {
			try {
				var prev = JSON.parse(sessionStorage.getItem('liquid-pending') || '{}');
				var merged = {};
				for (var k in prev) merged[k] = prev[k];
				for (var k2 in opts) merged[k2] = opts[k2];
				sessionStorage.setItem('liquid-pending', JSON.stringify(merged));
			} catch (e) {}
			return;
		}
		/* 正常页面：POST 到 ucode controller 持久化 */
		try {
			var base = (window.L && L.env && L.env.admin_path)
				? L.env.admin_path : '/cgi-bin/luci/admin/';
			var xhr = new XMLHttpRequest();
			xhr.open('POST', base + 'system/liquid/save_config');
			xhr.setRequestHeader('Content-Type', 'application/json');
			xhr.send(JSON.stringify(opts));
		} catch (e) {}
	}

	/* ===== 登录前暂存传递（main.js 顶部立即执行） =====
	   sessionStorage('liquid-pending') → localStorage（纯本地写入，极快）。
	   header ut 的 inline script 会用 localStorage 值覆盖 uci 旧值。
	   登录页不执行（登录页由 setMode 正常管理）。 */
	(function applyPending() {
		if (document.body && document.body.classList.contains('liquid-login'))
			return;
		try {
			var raw = sessionStorage.getItem('liquid-pending');
			if (!raw) return;
			var data = JSON.parse(raw);
			if (!data || typeof data !== 'object') return;
			/* 写 localStorage（header ut 会读到并覆盖 uci 旧值） */
			if (data.mode) localStorage.setItem('liquid-theme-mode', data.mode);
			if (data.accent) localStorage.setItem('liquid-accent', data.accent);
			if (data.accent_custom) localStorage.setItem('liquid-accent-custom', data.accent_custom);
			if (data.bing) localStorage.setItem('liquid-bing', data.bing);
			if (data.glass_opacity != null) localStorage.setItem('liquid-glass-opacity', String(data.glass_opacity));
		} catch (e) {}
	})();

	/* 登录后提交暂存（DOMContentLoaded 后异步 POST 持久化，不改 DOM） */
	function flushPending() {
		/* flushPending 现在由 showPendingToast 的按钮触发，
		   此处保留为空壳，避免登录后自动提交 */
	}
	/* 登录后提示暂存设置（DOMContentLoaded 后检查 sessionStorage） */
	function showPendingToast() {
		if (document.body && document.body.classList.contains('liquid-login'))
			return;
		try {
			if (!sessionStorage.getItem('liquid-pending')) return;
		} catch (e) { return; }

		/* 弹出玻璃 toast 提示 */
		var toast = document.createElement('div');
		toast.className = 'liquid-pending-toast';
		toast.innerHTML =
			'<span class="liquid-pending-toast-text">登录前修改的主题设置已暂存</span>' +
			'<span class="liquid-pending-toast-countdown"></span>' +
			'<button class="liquid-pending-toast-btn" data-action="apply">应用</button>' +
			'<button class="liquid-pending-toast-btn liquid-pending-toast-dismiss" data-action="dismiss">忽略</button>';
		document.body.appendChild(toast);
		requestAnimationFrame(function () { toast.classList.add('show'); });

		var countdownEl = toast.querySelector('.liquid-pending-toast-countdown');
		var remaining = 30;
		function tick() {
			if (remaining <= 0) {
				dismiss();
				return;
			}
			countdownEl.textContent = remaining + 's';
			remaining--;
			countdownTimer = setTimeout(tick, 1000);
		}
		var countdownTimer = setTimeout(tick, 1000);

		function applyPending() {
			clearTimeout(countdownTimer);
			try {
				var raw = sessionStorage.getItem('liquid-pending');
				if (raw) {
					var data = JSON.parse(raw);
					sessionStorage.removeItem('liquid-pending');
					if (data && typeof data === 'object') {
						var base = (window.L && L.env && L.env.admin_path)
							? L.env.admin_path : '/cgi-bin/luci/admin/';
						var xhr = new XMLHttpRequest();
						xhr.open('POST', base + 'system/liquid/save_config', true);
						xhr.setRequestHeader('Content-Type', 'application/json');
						xhr.send(JSON.stringify(data));
					}
				}
			} catch (e) {}
			setTimeout(function () { location.reload(); }, 200);
		}

		function dismiss() {
			clearTimeout(countdownTimer);
			sessionStorage.removeItem('liquid-pending');
			toast.classList.remove('show');
			setTimeout(function () { toast.remove(); }, 300);
		}

		toast.querySelector('[data-action="apply"]').addEventListener('click', applyPending);
		toast.querySelector('[data-action="dismiss"]').addEventListener('click', dismiss);
	}

	var mql = (typeof window.matchMedia == 'function')
		? window.matchMedia('(prefers-color-scheme: dark)')
		: null;

	var MODES = [
		{ id: 'light', icon: 'sun.svg',       title: 'Light mode' },
		{ id: 'dark',  icon: 'moon.svg',      title: 'Dark mode'  },
		{ id: 'auto',  icon: 'auto.svg',      title: 'Follow system' }
	];

	var ACCENTS = [
		{ id: 'blue',    color: '#2f7fe0', title: 'Blue'       },
		{ id: 'magenta', color: '#d63384', title: 'Magenta'     },
		{ id: 'amber',   color: '#e8940f', title: 'Amber'       },
		{ id: 'purple',  color: '#8e44ad', title: 'Tulip purple' },
		{ id: 'lime',    color: '#7fb52a', title: 'Yellow-green' }
	];

	var DEFAULT_ACCENT = '#2f7fe0';

	/* 自定义主题色工具：hex 校验/规范化 + 由单个主色派生全套 accent 变量 */
	function normalizeHex(v) {
		v = String(v || '').trim().replace(/^#/, '');
		if (/^[0-9a-fA-F]{3}$/.test(v))
			v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
		return /^[0-9a-fA-F]{6}$/.test(v) ? '#' + v.toLowerCase() : null;
	}

	function hexToRgb(hex) {
		var n = parseInt(hex.slice(1), 16);
		return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
	}

	function shade(rgb, pct) {
		var c = function (v) {
			v = Math.round(pct > 0 ? v + (255 - v) * pct : v * (1 + pct));
			return Math.max(0, Math.min(255, v));
		};
		return 'rgb(' + c(rgb.r) + ',' + c(rgb.g) + ',' + c(rgb.b) + ')';
	}

	function rgba(rgb, a) {
		return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + a + ')';
	}

	/* 在 <html> 上生成自定义色全套变量（亮/暗两套） */
	function applyCustomAccent(hex) {
		hex = normalizeHex(hex) || DEFAULT_ACCENT;
		var rgb = hexToRgb(hex);
		var root = document.documentElement;
		root.style.setProperty('--accent-custom', hex);
		root.style.setProperty('--accent-custom-medium', shade(rgb, -0.15));
		root.style.setProperty('--accent-custom-low', shade(rgb, -0.32));
		root.style.setProperty('--accent-custom-glow', rgba(rgb, 0.38));
		root.style.setProperty('--accent-custom-grad', 'linear-gradient(135deg, ' + shade(rgb, 0.25) + ' 0%, ' + hex + ' 48%, ' + shade(rgb, -0.4) + ' 100%)');
		root.style.setProperty('--accent-custom-glass', 'linear-gradient(135deg, ' + rgba(rgb, 0.3) + ', rgba(255,255,255,0.62))');
		root.style.setProperty('--accent-custom-glass-soft', 'linear-gradient(135deg, ' + rgba(rgb, 0.24) + ', rgba(255,255,255,0.72))');
		root.style.setProperty('--accent-custom-dark-high', shade(rgb, 0.3));
		root.style.setProperty('--accent-custom-dark-medium', shade(rgb, 0.12));
		root.style.setProperty('--accent-custom-dark-low', hex);
		root.style.setProperty('--accent-custom-dark-glow', rgba(rgb, 0.42));
		root.style.setProperty('--accent-custom-dark-grad', 'linear-gradient(135deg, ' + shade(rgb, 0.5) + ' 0%, ' + shade(rgb, 0.3) + ' 48%, ' + shade(rgb, 0.12) + ' 100%)');
		root.style.setProperty('--accent-custom-dark-glass', 'linear-gradient(135deg, ' + rgba(rgb, 0.28) + ', rgba(46,58,84,0.45))');
		root.style.setProperty('--accent-custom-dark-glass-soft', 'linear-gradient(135deg, ' + rgba(rgb, 0.22) + ', rgba(46,58,84,0.4))');
	}

	function getMode() {
		var d = document.body ? document.body.getAttribute('data-liquid-mode') : null;
		if (d)
			return d;
		try { return localStorage.getItem(MODE_KEY) || 'auto'; } catch (e) { return 'auto'; }
	}

	function setMode(mode) {
		try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
		if (document.body)
			document.body.setAttribute('data-liquid-mode', mode);
		applyMode(mode);
		updateSwitch();
		/* 明暗切换后 accent 背景的 RGB 需要用新模式的色值重写 */
		setGlassOpacity(getGlassOpacity());
		saveConfig({ mode: mode });
	}

	function isDark(mode) {
		return (mode == 'dark') || ((mode == 'auto') && mql && mql.matches);
	}

	function applyMode(mode) {
		var root = document.documentElement;
		/* 加 transition 让明暗切换平滑过渡，避免整页重算导致白屏闪烁 */
		root.style.transition = 'background-color .3s ease, color .3s ease';
		root.setAttribute('data-darkmode', isDark(mode) ? 'true' : 'false');
		root.setAttribute('data-liquid-mode', mode);
		setTimeout(function () { root.style.transition = ''; }, 350);
	}

	/* 明暗模式守护：OpenClash 等第三方脚本会覆写 <html data-darkmode>
	   （其 ocApplyRootTheme 按背景亮度判定后直接 setAttribute，且默认
	   oc-theme=auto），导致一进入 OpenClash 页面主题就被强制切成暗黑。
	   这里用 MutationObserver 监视该属性，任何与主题有效模式不符的外部
	   写入都被立即还原，并顺带同步 meta[name=color-scheme]——主题的
	   明暗由主题自身决定，不受第三方反控制。 */
	var _liquidGuardSelf = false;
	function guardDarkmode() {
		var root = document.documentElement;
		if (root.getAttribute('data-liquid-guard'))
			return;
		root.setAttribute('data-liquid-guard', '1');
		if (typeof MutationObserver == 'undefined')
			return;
		/* 还原逻辑：把 data-darkmode / color-scheme 拉回主题有效模式 */
		function enforce() {
			var want = isDark(getMode()) ? 'true' : 'false';
			if (root.getAttribute('data-darkmode') !== want) {
				_liquidGuardSelf = true;
				root.setAttribute('data-darkmode', want);
				_liquidGuardSelf = false;
			}
			var m = document.querySelector('meta[name="color-scheme"]');
			if (m && m.content !== (want == 'true' ? 'dark' : 'light'))
				m.content = (want == 'true' ? 'dark' : 'light');
			syncThemeColor();
		}
		var obs = new MutationObserver(function () {
			if (_liquidGuardSelf)
				return;
			enforce();
		});
		obs.observe(root, { attributes: true, attributeFilter: ['data-darkmode'] });
		/* 关键：安装监视器时立即校正一次当前状态。OpenClash 的 common.js
		   常在 main.js（footer 加载）之前执行，auto 模式下按 body 背景
		   亮度误判成 dark 并已写入 data-darkmode；若只监视后续变化，
		   从 main.js 加载到 OpenClash 下次重算之间页面会一直保持暗黑，
		   形成"进 OpenClash 先闪暗再纠正"的窗口。footer 脚本在首帧绘制
		   前执行，此刻校正可在用户看到任何暗色之前完成还原。 */
		enforce();
	}

	/* 浏览器工具栏配色（meta theme-color）：取底部 foot 玻璃横幅（p.luci）
	   的真实渲染色，移动端浏览器工具栏才能与页面上下玻璃栏融为一体。
	   foot = --glass-bg-strong 半透明玻璃叠在 body 底色 --background-color-medium
	   上；theme-color 要不透明值，用 1x1 canvas 做真实叠加合成（canvas
	   原生解析 CSS 色值并完成 alpha 混合），随明暗/配色变量自动跟随，
	   不硬编码色值。顶栏 #menubar 与 foot 同为 --glass-bg-strong，
	   故该色同时贴合顶部地址栏区域。 */
	function syncThemeColor() {
		var meta = document.querySelector('meta[name="theme-color"]');
		if (!meta)
			return;
		try {
			var cs = getComputedStyle(document.documentElement);
			var bg = (cs.getPropertyValue('--background-color-medium') || '').trim();
			var glass = (cs.getPropertyValue('--glass-bg-strong') || '').trim();
			if (!bg || !glass)
				return;
			var c = document.createElement('canvas');
			c.width = 1;
			c.height = 1;
			var ctx = c.getContext('2d');
			if (!ctx)
				return;
			ctx.fillStyle = bg;
			ctx.fillRect(0, 0, 1, 1);
			ctx.fillStyle = glass;
			ctx.fillRect(0, 0, 1, 1);
			var d = ctx.getImageData(0, 0, 1, 1).data;
			var hex = '#';
			for (var i = 0; i < 3; i++)
				hex += ('0' + d[i].toString(16)).slice(-2);
			if (meta.content !== hex)
				meta.content = hex;
		} catch (e) {}
	}

	function updateSwitch() {
		var mode = getMode();
		[].forEach.call(document.querySelectorAll('.liquid-mode-btn'), function (b) {
			b.classList.toggle('active', b.getAttribute('data-mode') == mode);
		});
	}

	/* ---- accent color switch ---- */

	function getAccent() {
		var d = document.body ? document.body.getAttribute('data-liquid-accent') : null;
		if (d)
			return d;
		try { return localStorage.getItem('liquid-accent') || 'blue'; } catch (e) { return 'blue'; }
	}

	function setAccent(id) {
		try { localStorage.setItem('liquid-accent', id); } catch (e) {}
		if (document.body)
			document.body.setAttribute('data-liquid-accent', id);
		document.documentElement.setAttribute('data-accent', id);
		if (id == 'custom')
			applyCustomAccent(getAccentCustom());
		updateColorSwitch();
		if (id != 'custom')
			saveConfig({ accent: id });
	}

	function getAccentCustom() {
		var d = document.body ? document.body.getAttribute('data-liquid-accent-custom') : null;
		if (d)
			return d;
		try { return localStorage.getItem('liquid-accent-custom') || DEFAULT_ACCENT; } catch (e) { return DEFAULT_ACCENT; }
	}

	/* 设置自定义主题色：非法值退回默认蓝，但仍启用自定义模式 */
	function setCustomAccent(hex) {
		hex = normalizeHex(hex) || DEFAULT_ACCENT;
		try { localStorage.setItem('liquid-accent-custom', hex); } catch (e) {}
		if (document.body)
			document.body.setAttribute('data-liquid-accent-custom', hex);
		setAccent('custom');
		saveConfig({ accent: 'custom', accent_custom: hex });
	}

	function getBing() {
		var d = document.body ? document.body.getAttribute('data-liquid-bing') : null;
		if (d)
			return d;
		try { return localStorage.getItem('liquid-bing') || '0'; } catch (e) { return '0'; }
	}

	function setBing(on) {
		var v = on ? '1' : '0';
		try { localStorage.setItem('liquid-bing', v); } catch (e) {}
		if (document.body) {
			document.body.setAttribute('data-liquid-bing', v);
			/* 页面渲染时模板已确保当日壁纸缓存就绪，打开即视为可用，即时生效 */
			document.body.setAttribute('data-liquid-bing-ok', v);
		}
		updateColorSwitch();
		saveConfig({ bing: v });
	}

	/* ---- glass opacity slider ----

	   滑杆 0~100 → alpha 系数 0.00~1.00（0=全透，100=全不透）。
	   默认值 = 现有设计参数值（亮/暗各不同），
	   各变量 alpha = baseAlpha × (slider / default)，
	   cap 到 [0, 1] 避免 RGBA 超值。
	   竖线 tick 标记默认位置，点击即回到默认。 */

	var GLASS_OPACITY_DEFAULT_LIGHT = 42;
	var GLASS_OPACITY_DEFAULT_DARK  = 40;

	function glassOpacityDefault() {
		var dark = document.documentElement.getAttribute('data-darkmode') === 'true';
		return dark ? GLASS_OPACITY_DEFAULT_DARK : GLASS_OPACITY_DEFAULT_LIGHT;
	}

	function getGlassOpacity() {
		var d = document.body ? document.body.getAttribute('data-liquid-glass-opacity') : null;
		if (d && d !== '')
			return parseInt(d, 10);
		try { return parseInt(localStorage.getItem('liquid-glass-opacity'), 10) || glassOpacityDefault(); } catch (e) { return glassOpacityDefault(); }
	}

	function setGlassOpacity(v) {
		v = Math.max(0, Math.min(100, Math.round(v)));
		try { localStorage.setItem('liquid-glass-opacity', String(v)); } catch (e) {}
		if (document.body)
			document.body.setAttribute('data-liquid-glass-opacity', String(v));
		var def = glassOpacityDefault();
		var factor = def > 0 ? Math.min(v / def, 100 / def) : 1;
		var root = document.documentElement;
		root.style.setProperty('--glass-opacity', factor.toFixed(2));
		/* 直接重写 accent 背景色（JS 计算 rgba，比 CSS calc 在渐变里更可靠） */
		_applyAccentAlpha(factor);
	}

	function _applyAccentAlpha(f) {
		var root = document.documentElement;
		var cs = getComputedStyle(root);
		var clamp01 = function (x) { return Math.max(0, Math.min(1, x)); };
		var a = function (varName, base) {
			/* 从 CSS 变量读 base alpha（第 4 个参数），乘以 factor，clamp */
			return clamp01(base * f);
		};
		/* 当前主题色的 accent-glass 变量基准 alpha（亮/暗通用）：
		   取自计算后的变量值，直接重写 */
		var accentHigh = cs.getPropertyValue('--primary-color-high').trim() || '#2f7fe0';
		/* accent-glass / accent-glass-soft / accent-glow 的亮暗基准值 */
		var dark = root.getAttribute('data-darkmode') === 'true';
		var glowBase    = dark ? 0.40 : 0.38;
		var glassBase   = dark ? [0.30, 0.50] : [0.32, 0.62];
		var softBase    = dark ? [0.24, 0.45] : [0.26, 0.72];
		var glowA   = a('--accent-glow-base', glowBase);
		var glassA1 = a('--accent-glass-base', glassBase[0]);
		var glassA2 = a('--accent-glass2-base', glassBase[1]);
		var softA1  = a('--accent-soft-base', softBase[0]);
		var softA2  = a('--accent-soft2-base', softBase[1]);
		root.style.setProperty('--accent-glow', 'rgba(' + _hexToRgb(accentHigh) + ',' + glowA.toFixed(2) + ')');
		root.style.setProperty('--accent-glass',
			'linear-gradient(135deg, rgba(' + _hexToRgb(accentHigh) + ',' + glassA1.toFixed(2) + '), ' +
			(dark ? 'rgba(46,58,84,' + glassA2.toFixed(2) + ')' : 'rgba(255,255,255,' + glassA2.toFixed(2) + ')') + ')');
		root.style.setProperty('--accent-glass-soft',
			'linear-gradient(135deg, rgba(' + _hexToRgb(accentHigh) + ',' + softA1.toFixed(2) + '), ' +
			(dark ? 'rgba(46,58,84,' + softA2.toFixed(2) + ')' : 'rgba(255,255,255,' + softA2.toFixed(2) + ')') + ')');
	}

	function _hexToRgb(hex) {
		hex = (hex || '#2f7fe0').replace('#', '');
		if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
		return parseInt(hex.substring(0,2),16) + ',' + parseInt(hex.substring(2,4),16) + ',' + parseInt(hex.substring(4,6),16);
	}

	function updateGlassSlider() {
		var s = document.querySelector('.liquid-glass-slider');
		if (s)
			s.value = getGlassOpacity();
	}

	function initGlassOpacitySlider() {
		var sw = document.querySelector('.liquid-color-switch');
		if (!sw || sw.querySelector('.liquid-glass-slider-wrap'))
			return;

		var wrap = document.createElement('div');
		wrap.className = 'liquid-glass-slider-wrap';

		var slider = document.createElement('input');
		slider.type = 'range';
		slider.className = 'liquid-glass-slider';
		slider.min = '0';
		slider.max = '100';
		slider.step = '1';
		slider.value = String(getGlassOpacity());
		slider.title = 'Glass opacity';
		slider.setAttribute('aria-label', 'Glass opacity');

		var def = glassOpacityDefault();

		/* 计算 slider thumb 中心相对于 wrap 左边缘的像素位置 */
		function thumbLeftPx(value) {
			var slRect = slider.getBoundingClientRect();
			var wRect = wrap.getBoundingClientRect();
			/* thumb 的中心偏移 = slider 内容区 left + border + thumb半径 + value比例 × 可用宽度 */
			var cs = getComputedStyle(slider);
			var padL = parseFloat(cs.paddingLeft) || 0;
			var padR = parseFloat(cs.paddingRight) || 0;
			var bw = parseFloat(cs.borderLeftWidth) || 0;
			var trackW = slRect.width - padL - padR - bw * 2;
			var thumbHalf = 8; /* thumb 宽 16px，半径 8 */
			var px = (slRect.left - wRect.left) + bw + padL + thumbHalf + (value / 100) * (trackW - thumbHalf * 2);
			return px;
		}

		/* 浮动数值气泡：拖动时跟随 thumb 实时显示当前值 */
		var bubble = document.createElement('div');
		bubble.className = 'liquid-glass-slider-bubble';
		bubble.style.display = 'none';
		wrap.appendChild(bubble);

		function updateBubble() {
			var v = parseInt(slider.value, 10);
			bubble.textContent = v;
			bubble.style.left = thumbLeftPx(v) + 'px';
		}

		slider.addEventListener('input', function () {
			setGlassOpacity(parseInt(slider.value, 10));
			updateBubble();
		});
		slider.addEventListener('pointerdown', function () {
			bubble.style.display = '';
			updateBubble();
		});
		slider.addEventListener('pointerup', function () {
			bubble.style.display = 'none';
			saveConfig({ glass_opacity: parseInt(slider.value, 10) });
		});
		slider.addEventListener('pointercancel', function () {
			bubble.style.display = 'none';
		});

		/* 默认值标记：百分比定位（border:none 后 thumb 百分比与 left 百分比一致） */
		var tick = document.createElement('div');
		tick.className = 'liquid-glass-slider-tick';
		tick.title = 'Default';
		tick.style.left = def + '%';
		tick.addEventListener('click', function () {
			slider.value = String(def);
			setGlassOpacity(def);
			saveConfig({ glass_opacity: def });
		});

		wrap.appendChild(slider);
		wrap.appendChild(tick);

		/* 锁屏页：滑杆放在胶囊容器外部下方，宽度跟随胶囊总宽 */
		var loginCapsules = document.getElementById('liquid-login-capsules');
		if (loginCapsules) {
			wrap.classList.add('liquid-glass-slider-login');
			loginCapsules.parentNode.insertBefore(wrap, loginCapsules.nextSibling);
			/* 动态计算滑杆宽度 = 胶囊实际宽度 - 缩进 */
			function syncSliderWidth() {
				var cw = loginCapsules.offsetWidth;
				if (cw > 0)
					wrap.style.width = Math.max(40, cw - 50) + 'px';
			}
			setTimeout(syncSliderWidth, 50);
			window.addEventListener('resize', syncSliderWidth);
		} else {
			sw.appendChild(wrap);
		}
	}

	function updateColorSwitch() {
		var accent = getAccent();
		[].forEach.call(document.querySelectorAll('.liquid-color-btn'), function (b) {
			b.classList.toggle('active', b.getAttribute('data-accent') == accent);
		});
		[].forEach.call(document.querySelectorAll('.liquid-bing-btn'), function (b) {
			b.classList.toggle('active', getBing() == '1');
		});
	}

	function initColorSwitch() {
		if (document.getElementById('liquid-color-switch'))
			return;

		var wrap = document.createElement('span');
		wrap.id = 'liquid-color-switch';
		wrap.className = 'liquid-color-switch';
		wrap.title = 'Accent color';

		/* Bing 每日壁纸开关（五色之前）：点亮启用在线壁纸 */
		var bingBtn = document.createElement('button');
		bingBtn.type = 'button';
		bingBtn.className = 'liquid-color-btn liquid-bing-btn';
		bingBtn.title = 'Bing 每日壁纸';
		bingBtn.setAttribute('aria-label', 'Bing daily wallpaper');
		bingBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect width="24" height="24" rx="5" fill="#008373"/><text x="12" y="17.5" font-family="Segoe UI, Arial, sans-serif" font-size="15" font-weight="700" fill="#ffffff" text-anchor="middle">b</text></svg>';
		bingBtn.addEventListener('click', function () {
			setBing(getBing() != '1');
		});
		wrap.appendChild(bingBtn);

		ACCENTS.forEach(function (c) {
			var btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'liquid-color-btn liquid-accent-' + c.id;
			btn.title = c.title;
			btn.setAttribute('data-accent', c.id);
			btn.setAttribute('aria-label', c.title);
			btn.style.background = c.color;
			btn.addEventListener('click', function () { setAccent(c.id); });
			wrap.appendChild(btn);
		});

		/* 自定义主题色（5 色之后）：彩虹圆点，点击下拉输入框输入颜色编码 */
		var customBtn = document.createElement('button');
		customBtn.type = 'button';
		customBtn.className = 'liquid-color-btn liquid-custom-btn';
		customBtn.title = 'Custom color';
		customBtn.setAttribute('data-accent', 'custom');
		customBtn.setAttribute('aria-label', 'Custom color');
		wrap.appendChild(customBtn);

		/* 菜单搜索按钮（Bing 之后）：点击下推抽屉式搜索框，实时过滤
		   菜单项（支持中英文标题），再点或点外部收回 */
		var searchBtn = document.createElement('button');
		searchBtn.type = 'button';
		searchBtn.className = 'liquid-color-btn liquid-search-btn';
		searchBtn.title = 'Search menu';
		searchBtn.setAttribute('aria-label', 'Search menu');
		searchBtn.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
		searchBtn.addEventListener('click', function (e) {
			e.stopPropagation();
			toggleMenuSearch(e.currentTarget);
		});
		wrap.appendChild(searchBtn);

		var pop = document.createElement('div');
		pop.id = 'liquid-custom-pop';
		pop.className = 'liquid-custom-pop';
		pop.style.display = 'none';
		var input = document.createElement('input');
		input.type = 'text';
		input.className = 'liquid-custom-input';
		input.placeholder = '#RRGGBB';
		input.maxLength = 7;
		input.setAttribute('spellcheck', 'false');
		pop.appendChild(input);
		wrap.appendChild(pop);

		function toggleCustomPop() {
			var show = pop.style.display == 'none';
			pop.style.display = show ? 'block' : 'none';
			if (show) {
				input.value = getAccentCustom();
				setTimeout(function () { input.focus(); input.select(); }, 0);
			}
		}

		/* 离开输入框（blur）即保存；非法值退回默认蓝 */
		function commitCustom() {
			var hex = normalizeHex(input.value);
			if (!hex)
				hex = DEFAULT_ACCENT;
			setCustomAccent(hex);
		}

		customBtn.addEventListener('click', function (e) {
			e.stopPropagation();
			toggleCustomPop();
		});
		input.addEventListener('keydown', function (e) {
			if (e.key == 'Enter') {
				commitCustom();
				pop.style.display = 'none';
			}
			else if (e.key == 'Escape') {
				pop.style.display = 'none';
			}
		});
		input.addEventListener('blur', function () { commitCustom(); });
		document.addEventListener('click', function (e) {
			if (!wrap.contains(e.target))
				pop.style.display = 'none';
		});

		var menubar = document.querySelector('#mainmenu');

		if (menubar) {
			/* 菜单栏顶部（水平居中） */
			menubar.insertBefore(wrap, menubar.firstChild);
		}
		else {
			/* lock screen / pages without a menubar */
			var capsules = document.getElementById('liquid-login-capsules');
			if (capsules) {
				/* 登录页：插入胶囊容器，不加 fixed 定位 */
				capsules.appendChild(wrap);
			}
			else {
				wrap.classList.add('liquid-color-switch-fixed');
				document.body.appendChild(wrap);
			}
		}

		updateColorSwitch();
	}

	/* ── 菜单搜索（抽屉式下推）────────────────────────────
	   搜索按钮点击：在 #mainmenu 顶部下推一个圆角矩形搜索框，
	   下面的菜单整体被往下推（抽屉式，非悬浮）。输入时实时过滤
	   菜单项（匹配显示文本 + 英文原题 data-title）。再次点按钮
	   或点击菜单外区域收回。 */
	var menuSearchOpen = false;
	var menuSearchBox = null;
	var menuSearchInput = null;

	function buildMenuSearchBox() {
		menuSearchBox = document.createElement('div');
		menuSearchBox.id = 'liquid-menu-search';
		menuSearchBox.className = 'liquid-menu-search';

		var icon = document.createElement('span');
		icon.className = 'liquid-menu-search-icon';
		icon.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';

		menuSearchInput = document.createElement('input');
		menuSearchInput.type = 'text';
		menuSearchInput.className = 'liquid-menu-search-input';
		menuSearchInput.placeholder = '搜索 / Search';
		menuSearchInput.setAttribute('spellcheck', 'false');
		menuSearchInput.addEventListener('input', function () {
			filterMenuItems();
			updateClearBtn();
		});

		var clearBtn = document.createElement('button');
		clearBtn.type = 'button';
		clearBtn.className = 'liquid-menu-search-clear';
		clearBtn.innerHTML = '&times;';
		clearBtn.title = 'Clear';
		clearBtn.addEventListener('click', function () {
			menuSearchInput.value = '';
			filterMenuItems();
			updateClearBtn();
			menuSearchInput.focus();
		});

		function updateClearBtn() {
			clearBtn.style.display = menuSearchInput.value ? 'inline-flex' : 'none';
		}
		updateClearBtn();

		menuSearchBox.appendChild(icon);
		menuSearchBox.appendChild(menuSearchInput);
		menuSearchBox.appendChild(clearBtn);

		var menu = document.getElementById('mainmenu');
		if (menu) {
			/* 插在颜色胶囊之后（本功能区不动，搜索框从其下方推出） */
			var sw = menu.querySelector('.liquid-color-switch');
			if (sw && sw.nextSibling)
				menu.insertBefore(menuSearchBox, sw.nextSibling);
			else
				menu.insertBefore(menuSearchBox, menu.firstChild);
		}
		else
			document.body.appendChild(menuSearchBox);

		return menuSearchBox;
	}

	function filterMenuItems() {
		var q = (menuSearchInput.value || '').trim().toLowerCase();
		var menu = document.getElementById('mainmenu');
		if (!menu)
			return;

		/* 收集所有菜单项（一级/二级，含中英文标题） */
		var items = [];
		menu.querySelectorAll('ul.mainmenu li').forEach(function (li) {
			var a = li.querySelector(':scope > a');
			if (!a)
				return;
			var isL1 = li.parentElement && li.parentElement.classList.contains('l1');
			items.push({
				li: li,
				text: (a.textContent || '').trim().toLowerCase(),
				en: ((a.getAttribute('data-title') || '')).toLowerCase(),
				isL1: isL1
			});
		});

		/* 清空：恢复全部显示 + 还原展开状态（只留当前页所在菜单） */
		if (!q) {
			items.forEach(function (it) {
				it.li.classList.remove('liquid-menu-hidden');
			});
			menu.querySelectorAll('ul.mainmenu.l1 > li').forEach(function (li) {
				if (!li.classList.contains('selected'))
					li.classList.remove('active');
			});
			return;
		}

		/* 匹配判断 */
		items.forEach(function (it) {
			it.match = (it.text.indexOf(q) != -1 || it.en.indexOf(q) != -1);
		});

		/* 按一级菜单分组处理：
		   一级匹配 → 展开并显示其全部二级项；
		   二级匹配 → 展开所属一级，显示匹配的二级项；
		   均不匹配 → 整组隐藏 */
		menu.querySelectorAll('ul.mainmenu.l1 > li').forEach(function (li) {
			var l1 = null, l2s = [];
			items.forEach(function (it) {
				if (it.li === li)
					l1 = it;
				else if (!it.isL1 && li.contains(it.li))
					l2s.push(it);
			});
			var l1Match = l1 && l1.match;
			var hasL2Match = l2s.some(function (it) { return it.match; });

			if (l1Match || hasL2Match) {
				li.classList.remove('liquid-menu-hidden');
				li.classList.add('active'); /* 展开二级菜单 */
				l2s.forEach(function (it) {
					if (l1Match || it.match)
						it.li.classList.remove('liquid-menu-hidden');
					else
						it.li.classList.add('liquid-menu-hidden');
				});
			}
			else {
				li.classList.add('liquid-menu-hidden');
			}
		});
	}

	function toggleMenuSearch(btn) {
		if (menuSearchOpen) {
			closeMenuSearch();
			return;
		}

		if (!menuSearchBox)
			buildMenuSearchBox();

		menuSearchBox.classList.add('open');
		menuSearchOpen = true;
		var menu = document.getElementById('mainmenu');
		if (menu)
			menu.classList.add('liquid-search-open');
		/* 搜索按钮与其他圆点一致的 active 高亮（用事件源按钮，可靠） */
		if (btn)
			btn.classList.add('active');
		else {
			var b = document.querySelector('.liquid-search-btn');
			if (b)
				b.classList.add('active');
		}
		setTimeout(function () { menuSearchInput.focus(); }, 50);
	}

	function closeMenuSearch() {
		if (!menuSearchOpen)
			return;
		menuSearchOpen = false;
		if (menuSearchBox)
			menuSearchBox.classList.remove('open'); /* height/opacity transition 平滑收回 */
		var menu = document.getElementById('mainmenu');
		if (menu)
			menu.classList.remove('liquid-search-open');
		/* 搜索按钮还原 */
		var btn = document.querySelector('.liquid-search-btn');
		if (btn)
			btn.classList.remove('active');
		/* 清空过滤，恢复全部菜单 */
		if (menuSearchInput) {
			menuSearchInput.value = '';
			filterMenuItems();
		}
		/* 还原菜单展开状态：只保留当前页所在的一级菜单展开 */
		if (menu) {
			menu.querySelectorAll('ul.mainmenu.l1 > li').forEach(function (li) {
				if (!li.classList.contains('selected'))
					li.classList.remove('active');
			});
		}
	}

	/* 点击菜单外区域收回（document 捕获阶段，排除搜索框/按钮自身） */
	document.addEventListener('click', function (e) {
		if (!menuSearchOpen)
			return;
		if (menuSearchBox && menuSearchBox.contains(e.target))
			return;
		if (e.target.closest && e.target.closest('.liquid-search-btn'))
			return;
		closeMenuSearch();
	}, true);

	function initSwitch() {
		if (document.getElementById('liquid-mode-switch'))
			return;

		var wrap = document.createElement('span');
		wrap.id = 'liquid-mode-switch';
		wrap.className = 'liquid-mode-switch';

		MODES.forEach(function (m) {
			var btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'liquid-mode-btn liquid-mode-' + m.id;
			btn.title = m.title;
			btn.setAttribute('data-mode', m.id);
			btn.setAttribute('aria-label', m.title);

			var img = document.createElement('img');
			img.src = L.media('svg/' + m.icon);
			img.alt = '';
			img.draggable = false;

			btn.appendChild(img);
			btn.addEventListener('click', function () { setMode(m.id); });
			wrap.appendChild(btn);
		});

		var indicators = document.getElementById('indicators');

		if (indicators && indicators.parentNode) {
			/* 顶栏原位置（刷新指示区左侧） */
			indicators.parentNode.insertBefore(wrap, indicators);
		}
		else {
			/* lock screen / pages without a menubar */
			var capsules = document.getElementById('liquid-login-capsules');
			if (capsules) {
				/* 登录页：插入胶囊容器，不加 fixed 定位 */
				capsules.appendChild(wrap);
			}
			else {
				wrap.classList.add('liquid-mode-switch-fixed');
				document.body.appendChild(wrap);
			}
		}

		updateSwitch();
	}

	/* keep auto mode in sync with OS theme changes */
	if (mql && typeof mql.addEventListener == 'function') {
		mql.addEventListener('change', function () {
			if (getMode() == 'auto')
				applyMode('auto');
		});
	}
	else if (mql && typeof mql.addListener == 'function') {
		mql.addListener(function () {
			if (getMode() == 'auto')
				applyMode('auto');
		});
	}

	/* 修复 zh-cn 复数翻译缺失：多个网络时 "Part of networks:" 显示英文原文，
	   统一成中文 */
	if (typeof N_ == 'function') {
		var origN = N_;
		N_ = function (count, one, other) {
			if (one == 'Part of network:' && other == 'Part of networks:')
				return '网络的一部分：';
			return origN(count, one, other);
		};
	}

	/* 内容区 tab 菜单追踪滑块（跟随 hover/选中项平滑滑动） */
	function initTabSliders() {
		document.querySelectorAll('ul.cbi-tabmenu').forEach(function (ul) {
			if (ul.classList.contains('liquid-tab-slider-init'))
				return;

			ul.classList.add('liquid-tab-slider-init');

			var ind = document.createElement('span');
			ind.className = 'liquid-tab-indicator';
			ul.appendChild(ind);

			function moveTo(el) {
				if (!el || !ul.contains(el)) {
					ind.style.opacity = '0';
					return;
				}
				var r = el.getBoundingClientRect();
				var ur = ul.getBoundingClientRect();
				ind.style.width = r.width + 'px';
				ind.style.height = r.height + 'px';
				ind.style.transform = 'translate(' + (r.left - ur.left) + 'px, ' + (r.top - ur.top) + 'px)';
				ind.style.opacity = '1';
			}

			moveTo(ul.querySelector('li.cbi-tab'));

			ul.addEventListener('mouseover', function (e) {
				var li = e.target.closest ? e.target.closest('li') : null;
				if (li && ul.contains(li))
					moveTo(li);
			});
			ul.addEventListener('mouseleave', function () {
				moveTo(ul.querySelector('li.cbi-tab'));
			});

			if (window.MutationObserver) {
				var mo = new MutationObserver(function () {
					moveTo(ul.querySelector('li.cbi-tab'));
				});
				mo.observe(ul, { attributes: true, subtree: true, attributeFilter: ['class'] });
			}
		});
	}

	/* 下拉宽度自适应：取选项中最长文本宽度 + 余量，总宽上限 240px
	   （"保存并应用"组合按钮除外，保持 auto）。原生 select 同步。 */
	function fitDropdownWidths() {
		document.querySelectorAll('.cbi-dropdown:not(.cbi-button-apply)').forEach(function (dd) {
			if (dd.classList.contains('liquid-dd-fit'))
				return;
			/* 打开中的下拉跳过测量：LuCI 正在克隆 preview/聚焦输入，
			   此时改 li/img 样式会干扰打开与自定义输入流程 */
			if (dd.hasAttribute('open') || dd.classList.contains('open'))
				return;
			dd.classList.add('liquid-dd-fit');
			var ul = dd.querySelector('ul');
			if (!ul)
				return;
			var maxW = 0;
			[].forEach.call(ul.querySelectorAll('li'), function (li) {
				if (li.classList.contains('hide-close') || li.classList.contains('hide-open'))
					return;
				/* 隐藏 li 无法直接测宽：临时 absolute+hidden 测量。
				   图标（img）未加载时宽度为 0 会漏算：临时给 24px 估算 */
				var imgs = li.querySelectorAll('img');
				var saved = [];
				[].forEach.call(imgs, function (img, i) {
					saved[i] = img.style.width;
					img.style.width = '24px';
					img.style.flexShrink = '0';
				});
				var st = li.style;
				st.display = 'block';
				st.position = 'absolute';
				st.visibility = 'hidden';
				st.whiteSpace = 'nowrap';
				var w = li.scrollWidth || 0;
				st.display = '';
				st.position = '';
				st.visibility = '';
				st.whiteSpace = '';
				[].forEach.call(imgs, function (img, i) {
					img.style.width = saved[i];
					img.style.flexShrink = '';
				});
				if (w > maxW)
					maxW = w;
			});

			/* 初始加载（读 uci 已选中项）：当前值行 li[display] 是闭合时
			   唯一可见的项，实测其渲染宽（含图标），保证胶囊不短于已选项 */
			[].forEach.call(ul.querySelectorAll('li[display]'), function (li) {
				var imgs = li.querySelectorAll('img');
				var saved = [];
				[].forEach.call(imgs, function (img, i) {
					saved[i] = img.style.width;
					img.style.width = '24px';
					img.style.flexShrink = '0';
				});
				var st = li.style;
				st.position = 'absolute';
				st.visibility = 'hidden';
				st.whiteSpace = 'nowrap';
				var w = li.scrollWidth || 0;
				st.position = '';
				st.visibility = '';
				st.whiteSpace = '';
				[].forEach.call(imgs, function (img, i) {
					img.style.width = saved[i];
					img.style.flexShrink = '';
				});
				if (w > maxW)
					maxW = w;
			});
			if (maxW > 0) {
				var w = Math.min(Math.max(maxW + 40, 60), 240);
				dd.style.width = w + 'px';
				dd.dataset.liquidW = w;   /* 记录，关闭后恢复（luci 会清） */
			}
		});

		document.querySelectorAll('.cbi-select').forEach(function (sel) {
			if (sel.classList.contains('liquid-dd-fit'))
				return;
			sel.classList.add('liquid-dd-fit');
			var s = sel.querySelector('select');
			if (!s)
				return;
			var maxW = 0;
			[].forEach.call(s.options, function (o) {
				var w = (o.text || '').length * 7.5;
				if (w > maxW)
					maxW = w;
			});
			if (maxW > 0)
				sel.style.width = Math.min(Math.max(maxW + 60, 60), 240) + 'px';
		});
	}

	/* 下拉框避让：按"屏幕上下可用空间"全局计算（而非卡片内相对位置）：
	   哪一侧剩余空间更多就朝哪侧弹出；并给列表设动态 max-height，
	   使其始终完整落在屏幕内（超出部分出滚动条，不再被屏幕边缘裁掉） */
	function adjustDropdownDirection() {
		document.querySelectorAll('.cbi-dropdown').forEach(function (dd) {
			var ul = dd.querySelector('ul.dropdown') || dd.querySelector('ul:not(.preview)');
			if (!ul)
				return;
			/* 打开判定：优先 dd 的 open 状态；部分第三方渲染（如
			   OpenClash）不设 open 属性，改判 ul 是否带 dropdown class */
			var open = dd.classList.contains('open') || dd.hasAttribute('open')
			        || ul.classList.contains('dropdown');

			if (!open) {
				/* 关闭：清理 luci 开合流程残留的 inline 定位（触屏分支的
				   left/right 会把闭合胶囊横向拉长）并恢复 fit 宽度
				   （luci closeDropdown 会清 dd.style.width） */
				ul.style.left = '';
				ul.style.right = '';
				ul.style.top = '';
				ul.style.bottom = '';
				ul.style.maxHeight = '';
				releaseCardBlur();
				if (dd.dataset.liquidW)
					dd.style.width = dd.dataset.liquidW + 'px';
				return;
			}

			/* 打开时暂时解除卡片链的 backdrop-filter：玻璃卡片形成
			   stacking context + containing block，内部 z-index 9999
			   出不去、fixed/absolute 被限制在卡片内（下拉被遮挡的根因）。
			   移除后下拉 z-index 可盖住后续卡片；关闭时 releaseCardBlur
			   恢复玻璃。 */
			holdCardBlur(dd);

			/* 清掉 luci 触屏分支残留的 left/right inline 定位：否则选项
			   列表可能被压成短短一横条/错位（F12 触发 resize 重算才恢复） */
			ul.style.left = '';
			ul.style.right = '';

			/* 打开时校准宽度：选项实际渲染宽（含图标，无论 img/背景），
			   修正初始 fit 对图标漏算导致的"图标被截" */
			var maxW = 0;
			ul.querySelectorAll('li').forEach(function (li) {
				var w = li.offsetWidth || 0;
				if (w > maxW)
					maxW = w;
			});
			if (maxW > 0) {
				var nw = Math.min(Math.max(maxW + 40, 60), 240);
				dd.style.width = nw + 'px';
				dd.dataset.liquidW = nw;
			}

			var r = dd.getBoundingClientRect();
			var vh = window.innerHeight;
			var downSpace = vh - r.bottom;   /* 按钮底 → 屏幕底 */
			var upSpace = r.top;             /* 屏幕顶 → 按钮顶 */
			var maxH;

			/* 先量出内容完整高度（临时去掉 max-height 限制） */
			ul.style.maxHeight = '';
			var fullH = ul.offsetHeight || 220;

			if (downSpace >= upSpace) {
				/* 下方空间更多：向下弹出，上限 = 下方可用空间 */
				ul.style.top = 'calc(100% + 4px)';
				ul.style.bottom = 'auto';
				maxH = Math.max(60, downSpace - 8);
			} else {
				/* 上方空间更多：向上弹出，上限 = 上方可用空间 */
				ul.style.top = 'auto';
				ul.style.bottom = 'calc(100% + 4px)';
				maxH = Math.max(60, upSpace - 8);
			}

			if (fullH > maxH)
				ul.style.maxHeight = maxH + 'px';
			else
				ul.style.maxHeight = '';
		});
	}

	/* ── 卡片 backdrop-filter 临时解除（下拉不被遮挡的关键）──
	   玻璃卡片 backdrop-filter 创建 stacking context + containing
	   block：内部下拉 z-index 9999 出不去、被后续卡片盖住。打开下拉
	   时给带 backdrop-filter 的祖先加 .liquid-dd-bf-off（CSS 置
	   backdrop-filter:none），关闭时移除。 */
	var _bfChain = [];
	function holdCardBlur(dd) {
		releaseCardBlur();
		var el = dd.parentElement;
		while (el && el !== document.body) {
			if (getComputedStyle(el).backdropFilter !== 'none' ||
			    getComputedStyle(el).webkitBackdropFilter !== 'none') {
				el.classList.add('liquid-dd-bf-off');
				_bfChain.push(el);
			}
			el = el.parentElement;
		}
	}
	function releaseCardBlur() {
		_bfChain.forEach(function (el) {
			el.classList.remove('liquid-dd-bf-off');
		});
		_bfChain = [];
	}

	/* cbi-dropdown：选择后确保 li[display] 跟随选中项（当前值显示兜底） */
	function syncDropdownValues() {
		document.querySelectorAll('.cbi-dropdown').forEach(function (dd) {
			if (dd.classList.contains('liquid-dd-init'))
				return;
			dd.classList.add('liquid-dd-init');

			function sync() {
				var ul = dd.querySelector('ul') || dd._liquidUl;
				if (!ul)
					return;

				/* 复选框与 selected 状态同步（luci 偶发只改其一） */
				ul.querySelectorAll('li').forEach(function (li) {
					var cb = li.querySelector('input[type="checkbox"]');
					if (cb)
						cb.checked = li.hasAttribute('selected');
				});

				var open = dd.classList.contains('open') || dd.hasAttribute('open');
				if (open)
					return;   /* 打开（多选打勾）时胶囊不变，避免频繁渲染 */

				if (dd.hasAttribute('multiple')) {
					/* 关闭后：把全部选中项设为 display 徽章（解除 luci 默认
					   只显示前几个的限制），竖向展示在胶囊内 */
					var n = 0;
					ul.querySelectorAll('li[display]').forEach(function (l) {
						if (!l.hasAttribute('selected'))
							l.removeAttribute('display');
					});
					ul.querySelectorAll('li[selected]').forEach(function (l) {
						if (!l.hasAttribute('display'))
							l.setAttribute('display', n);
						n++;
					});
					return;
				}

				var sel = ul.querySelector('li[selected]');
				var cur = ul.querySelector('li[display]');
				if (sel && cur !== sel) {
					if (cur)
						cur.removeAttribute('display');
					sel.setAttribute('display', '0');
				}
			}

			sync();
			/* luci 每次选值/取消都会派发 cbi-dropdown-change：同步勾选框与
			   selected 状态（点击即生效，不依赖 observer 时序） */
			dd.addEventListener('cbi-dropdown-change', function () {
				var u = dd.querySelector('ul') || dd._liquidUl;
				if (!u)
					return;
				u.querySelectorAll('li').forEach(function (li) {
					var cb = li.querySelector('input[type="checkbox"]');
					if (cb)
						cb.checked = li.hasAttribute('selected');
				});
			});
			if (window.MutationObserver) {
				var mo = new MutationObserver(function () {
					sync();
					adjustDropdownDirection();
				});
				mo.observe(dd, { attributes: true, subtree: true, attributeFilter: ['class', 'display', 'open', 'selected'] });
			}

			/* 兜底：点击选项后（ui.js toggleItem/closeDropdown 之后），
			   若关闭流程因任何原因中断（如 preview 缺失使 closeDropdown 抛错、
			   open 属性残留），强制把下拉重置为闭合态并让选中值显示在框里。 */
			dd.addEventListener('click', function (e) {
				/* 多选：luci 保持打开以便连续勾选，兜底不强制关闭；
				   但立即同步勾选框（当前事件循环结束、luci 处理完后） */
				if (dd.hasAttribute('multiple')) {
					setTimeout(function () {
						var u = dd.querySelector('ul') || dd._liquidUl;
						if (!u)
							return;
						u.querySelectorAll('li').forEach(function (li) {
							var cb = li.querySelector('input[type="checkbox"]');
							if (cb)
								cb.checked = li.hasAttribute('selected');
						});
					}, 0);
					return;
				}
				var li = e.target.closest ? e.target.closest('li') : null;
				if (!li || !li.parentNode || !li.parentNode.classList.contains('dropdown'))
					return;
				/* 点击"自定义"输入行（unselectable / 含 create 输入框）时
				   不能强制关闭——那是输入框，需要滞留让用户输入 */
				if (li.hasAttribute('unselectable') || li.querySelector('.create-item-input'))
					return;
				setTimeout(function () {
					var ul = dd.querySelector('ul.dropdown');
					if (!ul)
						return;  /* ui.js 已正常关闭 */
					var pv = dd.querySelector('ul.preview');
					if (pv && pv.parentNode === dd)
						dd.removeChild(pv);
					ul.classList.remove('dropdown');
					ul.style.top = ul.style.bottom = ul.style.maxHeight = '';
					dd.removeAttribute('open');
					var sel = ul.querySelector('li[selected]');
					if (!sel)
						return;  /* 点击未生效（toggleItem 没跑），不动现状 */
					ul.querySelectorAll('li[display]').forEach(function (l) {
						if (l !== sel)
							l.removeAttribute('display');
					});
					if (!sel.hasAttribute('display'))
						sel.setAttribute('display', '0');
				}, 0);
			});
		});
	}

	/* 悬浮内容框（.cbi-tooltip）：hover 时把 tooltip 临时移到 body 顶层
	   （fixed 定位），彻底脱离卡片 backdrop-filter 的 stacking context，
	   这样 tooltip 不会被相邻卡片遮挡。移出后放回原容器。
	   互斥保底：新的 hover 弹出时，先隐藏页面上所有其他 portal tooltip，
	   避免 mouseleave 偶尔不触发导致的残留停留。 */
	function portalTooltips() {
		document.querySelectorAll('.cbi-tooltip-container').forEach(function (c) {
			if (c.classList.contains('liquid-tip-init'))
				return;
			c.classList.add('liquid-tip-init');
			var tip = c.querySelector('.cbi-tooltip');
			if (!tip)
				return;
			var origParent = tip.parentNode;

			function hide() {
				if (tip.parentNode !== origParent)
					origParent.appendChild(tip);
				tip.classList.remove('liquid-tip-ported');
				tip.style.position = '';
				tip.style.left = '';
				tip.style.top = '';
				tip.style.zIndex = '';
				tip.style.opacity = '0';
				tip.style.visibility = 'hidden';
				tip.style.pointerEvents = '';
			}

			function show() {
				/* 互斥保底：先隐藏页面上所有其他已显示的 portal tooltip */
				document.querySelectorAll('.liquid-tip-ported').forEach(function (other) {
					if (other !== tip) {
						other.style.opacity = '0';
						other.style.visibility = 'hidden';
						other.classList.remove('liquid-tip-ported');
					}
				});
				var r = c.getBoundingClientRect();
				document.body.appendChild(tip);
				tip.style.position = 'fixed';
				tip.style.opacity = '0';
				tip.style.visibility = 'visible';
				tip.style.pointerEvents = 'none';
				/* 自动避让：量出悬浮框尺寸，超出屏幕时翻转/收进视口，
				   保证完整显示（同一帧内完成，无闪烁） */
				var tw = tip.offsetWidth, th = tip.offsetHeight;
				var vw = window.innerWidth, vh = window.innerHeight;
				var left = r.left, top = r.bottom + 6;
				if (left + tw > vw - 8)
					left = Math.max(8, vw - tw - 8);
				if (top + th > vh - 8)
					top = r.top - th - 6;
				if (top < 8) top = 8;
				if (left < 8) left = 8;
				tip.style.left = left + 'px';
				tip.style.top = top + 'px';
				tip.style.zIndex = '99999';
				tip.style.opacity = '1';
				tip.style.visibility = 'visible';
				tip.classList.add('liquid-tip-ported');
			}

			c.addEventListener('mouseenter', show);
			c.addEventListener('mouseleave', hide);
		});
	}

	/* 第三方插件的 fixed 弹窗（easytier .version-modal：刷新版本/重启服务
	   确认框）：弹窗自身 position:fixed + inset:0 + flex 居中，本应相对
	   视口居中，但插在玻璃卡片内时，卡片的 backdrop-filter 会成为 fixed
	   的包含块，弹窗变成相对整张卡片居中——卡片很高时弹窗落在当前屏幕
	   之外（移动端要下划才能看到）。移到 body 下即恢复视口居中。
	   与 portalTooltips 同思路；easytier 用 getElementById + classList
	   切换 .show 显隐，移动节点不影响其逻辑。弹窗依赖的 --card-bg 等
	   变量定义在 :root，移出卡片不失效 */
	/* 页面顶部的成功通知（如"系统密码已更改"）LuCI 的 ui.addNotification
	   用 info 类、插在 #maincontent 顶部（#view 的兄弟节点）——视觉上
	   被内容淹没。这里把它们搬进 #modal_overlay 走既有的居中弹窗体系
	   （centerModals/watchModals 已在运行），点击或 6 秒后自动关闭。
	   只搬 info/notice/success（成功提示），danger/warning 留在原位。 */
	function portalTopNotices() {
		/* 页面顶部的成功通知（如"系统密码已更改"）LuCI 用 info 类插在
		   #maincontent 顶部——视觉上被内容淹没。这里搬进主题自建的
		   独立遮罩层 #liquid-notice-overlay 居中弹出，6 秒/点击关闭。
		   不复用 ui.js 的 #modal_overlay：它里面常驻一个预创建的空
		   .modal 容器（showModal 底座），混用会把空壳一起显示出来
		   （两个框叠着），且 centerModals 会去居中那个空壳。
		   只搬 info/notice/success，danger/warning 留在原位。 */
		var mc = document.getElementById('maincontent');
		if (!mc)
			return;

		function getBox() {
			var box = document.getElementById('liquid-notice-overlay');
			if (!box) {
				box = document.createElement('div');
				box.id = 'liquid-notice-overlay';
				document.body.appendChild(box);
			}
			return box;
		}

		function promote(node) {
			if (node.nodeType !== 1 || !node.classList)
				return;
			if (!node.classList.contains('alert-message'))
				return;
			if (!(node.classList.contains('info') ||
			      node.classList.contains('notice') ||
			      node.classList.contains('success')))
				return;
			if (node.classList.contains('liquid-promoted'))
				return;
			var box = getBox();
			node.classList.add('liquid-promoted');
			box.appendChild(node);
			box.classList.add('show');
			var closed = false;
			function close() {
				if (closed)
					return;
				closed = true;
				if (node.parentNode)
					node.parentNode.removeChild(node);
				if (!box.querySelector('.alert-message'))
					box.classList.remove('show');
			}
			/* 点击任意处（含自带的"关闭"按钮）即关 */
			node.addEventListener('click', close);
			setTimeout(close, 6000);
		}

		/* 页面加载时已存在的通知 */
		mc.querySelectorAll(':scope > .alert-message').forEach(promote);
		if (window.MutationObserver) {
			/* SPA 切页/保存后新插入的通知 */
			new MutationObserver(function (muts) {
				muts.forEach(function (m) {
					m.addedNodes.forEach(promote);
				});
			}).observe(mc, { childList: true });
		}
	}

	/* ── 页脚版本号 → 检查更新（对齐 pushbot 的检查更新设计）─────────
	   访问端浏览器前端 fetch GitHub raw Makefile（8s 超时），与本地
	   PKG_VERSION-PKG_RELEASE 比较，四态 frosted toast：
	   已最新(绿)/内测版(紫)/检测到更新(橙)/查询失败(红)。
	   - 非更新态：8s 自动消失（比 pushbot 多 4s），点卡片超链接作者仓库
	   - 更新态：不自动消失；按钮行 = pushbot 同款（一键更新/拉取新包/
	     下载链接/清理包/忽略）+ 多一个"作者仓库"在忽略左边
	   - 在线更新走主题自己的 OTA 端点（controller liquid.uc），
	     安装完成后倒计时刷新（轮询 act_version，与 pushbot 一致）
	   登录页不绑定（保留页脚版本号原跳转仓库超链接）。 */
	function initVersionCheck() {
		var REPO = 'https://github.com/zzsj0928/luci-theme-liquid';
		var RAW_MK = 'https://raw.githubusercontent.com/zzsj0928/luci-theme-liquid/main/Makefile';

		function api(name) {
			var b = (window.L && L.env && L.env.admin_path)
				? L.env.admin_path : '/cgi-bin/luci/admin/';
			return b + 'system/liquid/' + name;
		}

		/* pushbot 同款版本比较：0.8-r69 → 0.8.69 逐段数字比 */
		function cmpVer(a, b) {
			a = String(a || '').replace(/^v/, '').replace(/-r/, '.');
			b = String(b || '').replace(/^v/, '').replace(/-r/, '.');
			var pa = a.split(/[.-]/), pb = b.split(/[.-]/), i, x, y;
			for (i = 0; i < Math.max(pa.length, pb.length); i++) {
				x = parseInt(pa[i], 10) || 0;
				y = parseInt(pb[i], 10) || 0;
				if (x > y) return 1;
				if (x < y) return -1;
			}
			return 0;
		}

		function ringHtml(pct) {
			return '<span class="liquid-ota-ring"><svg viewBox="0 0 36 36">'
				+ '<circle cx="18" cy="18" r="15.9" class="liquid-ota-ring-bg"/>'
				+ '<circle cx="18" cy="18" r="15.9" class="liquid-ota-ring-fg" style="stroke-dasharray:'
				+ pct + ', 100"/></svg></span>';
		}

		/* 在页脚内弹出 frosted 卡片（overlay 锚定页脚盒子 → 页脚宽度内居中）。
		   inCard=true 时把提示盖到"检测到更新"卡片内部、卡片内上下左右
		   居中模糊弹出（流程内错误如"下载失败"，对齐 pushbot
		   pb_ota_showError 设计）；无更新卡片时退回页脚锚定 */
		function showToast(msg, sub, cls, buttons, autoMs, clickRepo, extraStyle, inCard) {
			var badge = document.querySelector('p.luci-foot a.liquid-version-link');
			var footer = badge ? badge.closest('p.luci') : null;
			var card = inCard ? document.querySelector('p.luci-foot .liquid-ver-toast.is-update') : null;
			/* r22：非卡片内提示 → 挂 body（fixed 根层），不再挂页脚。原因：
			   页脚带 backdrop-filter，卡片(子元素)伸出其盒子时 iOS WebKit 的
			   合成会把后面同为 backdrop-filter 的玻璃卡片绘制层压在伸出部分之上
			   ——布局/命中测试说它在上、绘制却在下（实测 hit=benka、z>30=none、
			   锚点正确，但肉眼被盖；所有页面都发生、固定高度处出现剪裁边界，
			   正是某层玻璃/页脚固定高度带的边）。根层 fixed + z1500 后绘制顺序
			   在任何引擎里平凡正确（>内容/ifacebox:hover 1001，<modal 2000）。 */
			if (!footer && !card) return null;
			var parent = card || document.body;
			var ov = document.createElement('div');
			ov.className = 'liquid-ver-overlay' + (card ? ' card-centered' : '');
			var toast = document.createElement('div');
			toast.className = 'liquid-ver-toast ' + cls + (clickRepo ? ' is-clickable' : '');
			if (extraStyle) toast.style.cssText = extraStyle;
			var tm = document.createElement('div');
			tm.className = 'liquid-ver-toast-msg';
			tm.textContent = msg;
			toast.appendChild(tm);
			if (sub) {
				var ts = document.createElement('div');
				ts.className = 'liquid-ver-toast-sub';
				ts.textContent = sub;
				toast.appendChild(ts);
			}
			if (buttons && buttons.length > 0) {
				var row = document.createElement('div');
				row.className = 'liquid-ota-btn-row';
				buttons.forEach(function(cfg) {
					var b = document.createElement('button');
					b.type = 'button';
					b.className = 'liquid-ota-btn';
					b.textContent = cfg.label;
					if (cfg.id) b.id = cfg.id;
					b.addEventListener('click', function(e) {
						e.preventDefault();
						e.stopPropagation();
						if (cfg.onClick) cfg.onClick(b, res);
					});
					row.appendChild(b);
				});
				toast.appendChild(row);
			}
			ov.appendChild(toast);
			parent.appendChild(ov);
			var syncBottom = null;
			if (!card && footer) {
				syncBottom = function() {
					ov.style.bottom = (footer.offsetHeight || 34) + 'px';
				};
				syncBottom();
				setTimeout(syncBottom, 20);
				window.addEventListener('resize', syncBottom);
			}
			setTimeout(function() { ov.classList.add('show'); }, 20);
var autoId = null;
			if (autoMs > 0) {
				autoId = setTimeout(function() { res.dismiss(); }, autoMs);
			}
			var res = {
				ov: ov,
				dismiss: function() {
					if (autoId) { clearTimeout(autoId); autoId = null; }
					if (syncBottom) window.removeEventListener('resize', syncBottom);
					ov.classList.remove('show');
					setTimeout(function() { ov.remove(); }, 550);
				}
			};
			/* 非更新态：点卡片超链接作者仓库 */
			if (clickRepo) {
				toast.addEventListener('click', function(e) {
					if (e.target.closest && e.target.closest('button')) return;
					window.open(REPO, '_blank');
					res.dismiss();
				});
			}
			return res;
		}

		/* 流程内错误提示（下载失败等，pushbot 同款 4s 消失）：
		   盖在更新卡片上、卡片内居中模糊弹出 */
		function liquidOtaError(msg) {
			showToast(msg, null, 'is-err', null, 4000, false, null, true);
		}

		/* 安装完成后的倒计时卡片：轮询 act_version，版本变化即刷新，
		   10s 兜底强制刷新（与 pushbot pb_ota_showCountdown 一致） */
		function liquidOtaCountdown(local) {
			var cdToast = showToast('安装完成', null, 'is-latest', null, 0, false,
				'min-width:150px;max-width:220px;padding:12px 16px;border-radius:10px;text-align:center;transform:scale(0.85);');
			if (!cdToast) return;
			cdToast.ov.style.zIndex = '99999';
			cdToast.ov.querySelector('.liquid-ver-toast').innerHTML =
				'<div style="font-size:22px;font-weight:800;font-family:Menlo,Consolas,monospace" id="liquid_ota_countdown">10</div>'
				+ '<div style="margin-top:6px"><button onclick="location.reload()" style="padding:4px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.35);background:rgba(255,255,255,0.15);color:#fff;font-size:11px;font-weight:600;cursor:pointer">立即刷新</button></div>';
			var cdSec = 10;
			var cdTimer = setInterval(function() {
				cdSec--;
				var el = document.getElementById('liquid_ota_countdown');
				if (el) el.textContent = cdSec;
				if (cdSec <= 0) { clearInterval(cdTimer); clearInterval(verTimer); location.reload(); }
			}, 1000);
			/* 每 2s 轮询主题版本，变了立即刷新 */
			var verTimer = setInterval(function() {
				var px = new XMLHttpRequest();
				px.open('GET', api('version') + '?_=' + Date.now());
				px.onload = function() {
					try {
						var d = JSON.parse(px.responseText);
						if (d && d.version && local && d.version !== local) {
							clearInterval(verTimer);
							clearInterval(cdTimer);
							location.reload();
						}
					} catch (e) {}
				};
				px.send();
			}, 2000);
		}

		function bind() {
			/* 登录页不接管（保留原跳转仓库超链接），也避免选择器永远
			   匹配不到导致的无限 200ms 重试 */
			if (document.body && document.body.classList.contains('liquid-login')) return;
			var badge = document.querySelector('p.luci-foot a.liquid-version-link');
			if (!badge) { setTimeout(bind, 200); return; }
			if (badge._lvBound) return;
			badge._lvBound = true;
			badge.title = '点击检查更新';

			badge.addEventListener('click', function(e) {
				e.preventDefault();
				if (badge.classList.contains('is-checking')) return;
				badge.classList.add('is-checking');
				var local = badge.getAttribute('data-ver') || '';
				/* 新检查前清掉旧卡片，避免叠加 */
				var footer = badge.closest('p.luci');
				if (footer)
					footer.querySelectorAll('.liquid-ver-overlay').forEach(function(o) { o.remove(); });

				var ctl = new AbortController();
				var timer = setTimeout(function() { ctl.abort(); }, 8000);
				fetch(RAW_MK, { signal: ctl.signal })
					.then(function(r) {
						if (!r.ok) throw new Error('HTTP ' + r.status);
						return r.text();
					})
					.then(function(txt) {
						clearTimeout(timer);
						var mv = txt.match(/PKG_VERSION:=([0-9.]+)/);
						var mr = txt.match(/PKG_RELEASE:=([0-9]+)/);
						var remote = (mv && mr) ? mv[1] + '-r' + mr[1] : '';
						if (!remote) throw new Error('parse');
						var c = cmpVer(local, remote);
						var msg, cls;
						if (c > 0) { msg = '已是抢先体验的内测版！'; cls = 'is-ahead'; }
						else if (c < 0) { msg = '作者仓库发布了新版本！'; cls = 'is-update'; }
						else { msg = '已经是最新版本！'; cls = 'is-latest'; }
						var sub = '📦 v' + local + '　☁️ v' + remote;
						var remoteVer = mv[1], remoteRel = mr[1];

						var btns = null;
						if (c < 0) {
							btns = [
								{
									label: '一键更新',
									id: 'liquid_ota_oneclick_btn',
									onClick: function(btn, r2) {
										btn.disabled = true;
										btn.innerHTML = ringHtml(0) + '0%';
										/* 与"拉取新包"完全一致的轮询/报错链路（pushbot 原版一键更新缺
										   zeroCount 守卫会默默卡 0%）：即刻轮询不等 onload、fail→下载失败、
										   卡0%×20s→GitHub Release 无法访问、网络错→下载失败 */
										var zeroCount = 0;
										var pollId = setInterval(function() {
											var px = new XMLHttpRequest();
											px.open('GET', api('ota_download_progress') + '?_=' + Date.now());
											px.onload = function() {
												try {
													var pd = JSON.parse(px.responseText);
													var pct = pd.progress || '0';
													if (pct === 'done') {
														clearInterval(pollId);
														btn.textContent = '安装中...';
														var ix = new XMLHttpRequest();
														ix.open('GET', api('ota_install') + '?_=' + Date.now());
														ix.send();
														r2.dismiss();
														liquidOtaCountdown(local);
														} else if (pct === 'fail') {
														clearInterval(pollId);
														btn.disabled = false;
														btn.textContent = '一键更新';
														liquidOtaError('下载失败');
														} else {
															var num = parseInt(pct, 10) || 0;
															if (num === 0) zeroCount++; else zeroCount = 0;
															if (zeroCount >= 20) {
																clearInterval(pollId);
																btn.disabled = false;
																btn.textContent = '一键更新';
																liquidOtaError('GitHub Release 无法访问');
																return;
															}
															btn.innerHTML = ringHtml(num) + num + '%';
														}
													} catch (e) {}
												};
											px.send();
										}, 1000);
										var x = new XMLHttpRequest();
										x.open('GET', api('ota_download') + '?ver=' + encodeURIComponent(remoteVer)
											+ '&rel=' + encodeURIComponent(remoteRel) + '&_=' + Date.now());
										x.onerror = function() {
											clearInterval(pollId);
											btn.disabled = false;
											btn.textContent = '一键更新';
											liquidOtaError('下载失败');
										};
										x.send();
									}
								},
																{
									label: '拉取新包',
									id: 'liquid_ota_pull_btn',
									onClick: function(btn, r2) {
										/* 已下载完 → 直接安装 */
										if (btn.getAttribute('data-ready') === '1') {
											btn.disabled = true;
											btn.textContent = '安装中...';
											var ix = new XMLHttpRequest();
											ix.open('GET', api('ota_install') + '?_=' + Date.now());
											ix.send();
											r2.dismiss();
											liquidOtaCountdown(local);
											return;
										}
										btn.disabled = true;
										btn.innerHTML = ringHtml(0) + '0%';
										var zeroCount = 0;
										var pollId = setInterval(function() {
											var px = new XMLHttpRequest();
											px.open('GET', api('ota_download_progress') + '?_=' + Date.now());
											px.onload = function() {
												try {
													var pd = JSON.parse(px.responseText);
													var pct = pd.progress || '0';
													if (pct === 'done') {
														clearInterval(pollId);
														btn.disabled = false;
														btn.textContent = '安装更新';
														btn.classList.add('liquid-ota-ready');
														btn.setAttribute('data-ready', '1');
													} else if (pct === 'fail') {
														clearInterval(pollId);
														btn.disabled = false;
														btn.textContent = '拉取新包';
														liquidOtaError('下载失败');
													} else {
														var num = parseInt(pct, 10) || 0;
														if (num === 0) zeroCount++; else zeroCount = 0;
														if (zeroCount >= 20) {
															clearInterval(pollId);
															btn.disabled = false;
															btn.textContent = '拉取新包';
															liquidOtaError('GitHub Release 无法访问');
															return;
														}
														btn.innerHTML = ringHtml(num) + num + '%';
													}
												} catch (e) {}
											};
											px.send();
										}, 1000);
										/* 触发下载（后台进行），网络层失败与一键更新同样立即报错 */
										var xhr = new XMLHttpRequest();
										xhr.open('GET', api('ota_download') + '?ver=' + encodeURIComponent(remoteVer)
											+ '&rel=' + encodeURIComponent(remoteRel) + '&_=' + Date.now());
										xhr.onerror = function() {
											clearInterval(pollId);
											btn.disabled = false;
											btn.textContent = '拉取新包';
											liquidOtaError('下载失败');
										};
										xhr.send();
									}
								},
								{
									label: '下载链接',
									onClick: function(btn, r2) {
										var baseUrl = REPO + '/releases/download/luci-theme-liquid-v'
											+ remoteVer + '-r' + remoteRel + '/';
										var isApk = false;
										var xh = new XMLHttpRequest();
										xh.open('GET', api('detect_pkgmgr') + '?_=' + Date.now(), false);
										xh.send();
										if (xh.status === 200) {
											try { var d = JSON.parse(xh.responseText); isApk = (d.pkgmgr === 'apk'); } catch (e) {}
										}
										var file = isApk
											? ('luci-theme-liquid-' + remoteVer + '-r' + remoteRel + '.apk')
											: ('luci-theme-liquid_' + remoteVer + '-r' + remoteRel + '_all.ipk');
										window.open(baseUrl + file, '_blank');
										r2.dismiss();
									}
								},
								{
									label: '清理包',
									onClick: function(btn, r2) {
										var xhr = new XMLHttpRequest();
										xhr.open('GET', api('ota_clear') + '?_=' + Date.now());
										xhr.onload = function() {
											btn.textContent = '已清理';
											btn.disabled = true;
											setTimeout(function() { r2.dismiss(); }, 1500);
										};
										xhr.send();
									}
								},
								{
									label: '作者仓库',
									onClick: function(btn, r2) {
										window.open(REPO, '_blank');
										r2.dismiss();
									}
								},
								{
									label: '忽略',
									onClick: function(btn, r2) {
										r2.dismiss();
									}
								}
							];
						}
						/* 更新态：不自动消失(0)；其他态：8s（比 pushbot 多 4s）+ 点卡片跳仓库 */
						showToast(msg, sub, cls, btns, btns ? 0 : 8000, !btns);
					})
					.catch(function() {
						clearTimeout(timer);
						showToast('网络异常，无法访问作者仓库！ ☹️', '📦 v' + local, 'is-err', null, 8000, true);
					})
					.finally(function() { badge.classList.remove('is-checking'); });
			});
		}

		if (document.readyState === 'complete')
			bind();
		else
			window.addEventListener('load', bind);
		setTimeout(bind, 200);
	}

	function portalFixedModals() {
		document.querySelectorAll('.version-modal').forEach(function (m) {
			if (m.parentNode !== document.body)
				document.body.appendChild(m);
		});
	}

	/* 文档级滚动配套（r22）：LuCI SPA 切页（菜单/面包屑/标签链接 → XHR
	   换 #view 内容）不重置文档滚动位置，新页面会停在旧深度；安卓对
	   "初始滚动非零"的页面要先把滚到顶再下滑才肯收缩地址栏。这里在
	   点击站内导航链接后监听 #view 直接子节点变化（= 切页渲染完成；
	   深层的自动刷新/控件更新不触发，避免误回顶），一旦换页立即把
	   文档滚回顶部——每个页面都从顶开始，首次下滑即可收缩工具栏。
	   整页跳转时观察器随页面销毁，无副作用；5 秒兜底自动撤防 */
	function initNavScrollTop() {
		if (typeof MutationObserver == 'undefined')
			return;
		var mo = null, timer = 0;
		function disarm() {
			if (timer) { clearTimeout(timer); timer = 0; }
			if (mo) { mo.disconnect(); mo = null; }
		}
		document.addEventListener('click', function (ev) {
			if (ev.button !== 0)
				return;
			var a = (ev.target && ev.target.closest) ? ev.target.closest('a[href]') : null;
			if (!a)
				return;
			var href = a.getAttribute('href') || '';
			/* 只处理站内导航：排除纯锚点、外部链接、javascript 伪协议 */
			if (!href || href.charAt(0) == '#' ||
			    /^(?:[a-z][a-z0-9+.-]*)?\/\//i.test(href) ||
			    href.toLowerCase().indexOf('javascript:') === 0)
				return;
			var view = document.getElementById('view');
			if (!view)
				return;
			disarm();
			mo = new MutationObserver(function () {
				disarm();
				window.scrollTo(0, 0);
			});
			mo.observe(view, { childList: true });
			timer = setTimeout(disarm, 5000);
		}, true);
	}

	/* 登录页 logo：luci 的 modal.login 是 JS 渲染的，注入内联 SVG
	   （跟随主题色 + 玻璃水滴感），替换原 CSS 背景图 */
	function injectLoginLogo() {
		var m = document.querySelector('body.liquid-login #modal_overlay > .modal.login');
		if (!m || m.querySelector('.liquid-logo'))
			return;
		var w = document.createElement('div');
		w.innerHTML = '<svg class="liquid-logo" viewBox="0 0 64 68" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="liquid-lg-login" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0%" stop-color="rgba(255,255,255,0.55)"/><stop offset="30%" stop-color="rgba(255,255,255,0.20)"/><stop offset="100%" stop-color="var(--primary-color-low)" stop-opacity="0.85"/></linearGradient><linearGradient id="liquid-lg-shine" x1="0.3" y1="0" x2="0.7" y2="0.6"><stop offset="0%" stop-color="white" stop-opacity="0.6"/><stop offset="60%" stop-color="white" stop-opacity="0"/></linearGradient></defs><path d="M32 3 C46 20 57 30 57 42 a25 25 0 0 1 -50 0 C7 30 18 20 32 3 Z" fill="url(#liquid-lg-login)"/><path d="M32 3 C46 20 57 30 57 42 a25 25 0 0 1 -50 0 C7 30 18 20 32 3 Z" fill="url(#liquid-lg-shine)"/><ellipse cx="23" cy="39" rx="9.5" ry="6" fill="#ffffff" opacity="0.35"/></svg>';
		m.insertBefore(w.firstChild, m.firstChild);
	}

	/* ===== 登录页：卡片与固定页脚的重叠检测（Duo 外屏/内屏、iOS 工具栏展开等）=====
	   起因：外屏登录框下半截被页脚压住（连登录按钮都被盖）、内屏轻微覆盖。
	   为什么不用 UA/分辨率判断设备：iOS 的 EdgiOS UA 只有 OS 版本+浏览器构建号，
	   读不到机型与屏幕形态；分辨率能区分内外屏但会误伤同尺寸的其它设备。
	   这里直接量几何——整个 stack（顶部胶囊+卡片）的上下边 vs 视口安全区与
	   页脚顶线（fixed bottom:4+自身高），重叠才分级处理：
	     clear=页脚留净空(卡片上移) / fit=整栈 zoom 等比缩小(不滚动、页脚始终
	   可见、顶部胶囊不裁)。不重叠的平台零变化。监听 resize / orientationchange
	   / visualViewport 以覆盖 iOS 工具栏展开收起引起的视口变化。 */
	function syncLoginFooterClearance() {
		var body = document.body;
		if (!body || !body.classList.contains('liquid-login'))
			return;
		var overlay = document.getElementById('liquid-login');
		var stack = overlay && overlay.querySelector('.liquid-login-stack');
		var card = stack && stack.querySelector('.modal.login');
		var foot = document.querySelector('p.luci');
		if (!overlay || !stack || !card || !foot)
			return;

		/* 复位到"零变化"基线 */
		body.classList.remove('liquid-login-clear');
		body.classList.remove('liquid-login-fit');
		stack.style.zoom = '';

		function geom() {
			var sr = stack.getBoundingClientRect();
			var fh = foot.offsetHeight || 0;
			var vh = overlay.clientHeight;
			return {
				top: sr.top,
				bottom: sr.bottom,
				height: sr.height,
				footTop: vh - 4 - fh,
				vh: vh
			};
		}
		function fits() {
			var g = geom();
			/* 顶部不被裁(留8px)、底部不进页脚区(留8px气口)、卡片不超高 */
			return g.top >= 8 && g.bottom <= g.footTop - 8 &&
				card.getBoundingClientRect().height <= g.vh - 8;
		}

		if (fits())
			return;                       /* 不重叠 → 一个 class 都不加（其它平台零变化） */

		/* 级1 clear：给页脚留净空，卡片整体上移一点（解决轻微覆盖） */
		body.classList.add('liquid-login-clear');
		if (fits())
			return;

		/* 级2 fit：整栈等比缩小（zoom）——小屏不滚动、页脚固定可见、
		   顶部胶囊不被裁（用户要求：缩小登录页所有元素比例）。
		   注意 flex 是垂直居中：栈底 = (内容高+缩放后高)/2，不能按顶对齐公式
		   算，改为"保留 clear 净空 + 逐次收敛"——每缩 8% 复测一次直到 fits。 */
		body.classList.add('liquid-login-clear');   /* fit 期间保留净空，整体上移 */
		body.classList.add('liquid-login-fit');
		var scale = 1;
		stack.style.zoom = scale;
		for (var i = 0; i < 12 && !fits(); i++) {
			scale = Math.max(scale * 0.92, 0.4);   /* 0.4 兜底，避免缩到不可读 */
			stack.style.zoom = scale;
			if (scale <= 0.401)
				break;
		}
	}

	function scheduleLoginFooterClearance() {
		if (window.requestAnimationFrame)
			window.requestAnimationFrame(syncLoginFooterClearance);
		else
			syncLoginFooterClearance();
	}

	scheduleLoginFooterClearance();
	window.addEventListener('load', scheduleLoginFooterClearance);
	window.addEventListener('resize', scheduleLoginFooterClearance);
	window.addEventListener('orientationchange', scheduleLoginFooterClearance);
	if (window.visualViewport)
		window.visualViewport.addEventListener('resize', scheduleLoginFooterClearance);
	setTimeout(scheduleLoginFooterClearance, 300);   /* 字体/布局落定后复核 */
	if (window.MutationObserver) {
		/* 输密码报错会让卡片变高 → 重新判定 */
		new MutationObserver(scheduleLoginFooterClearance)
			.observe(document.getElementById('liquid-login') || document.body,
				{ childList: true, subtree: true, characterData: true });
	}

	/* 窗口尺寸变化时重新计算已打开下拉框的方向 */
	window.addEventListener('resize', function () {
		setTimeout(adjustDropdownDirection, 60);
	});

	/* 移动端菜单 top 跟随顶栏实际高度（防顶栏被撑高后菜单盖住它） */
	function syncMenuTop() {
		var bar = document.getElementById('menubar');
		var menu = document.getElementById('mainmenu');

		if (!bar || !menu)
			return;

		if (window.matchMedia && window.matchMedia('(max-width: 854px)').matches)
			menu.style.top = (bar.offsetHeight + 1) + 'px';
		else
			menu.style.top = '';
	}

	/* #indicators 由 ui.js 动态渲染，顶栏高度在 DOMContentLoaded 时可能未定型：
	   延迟二次校准 + 汉堡点击时校准 */
	function scheduleMenuTop() {
		setTimeout(syncMenuTop, 0);
	}

	applyCustomAccent(getAccentCustom());
	guardDarkmode();
	syncThemeColor();

	if (document.readyState == 'loading')
		document.addEventListener('DOMContentLoaded', function () {
			flushPending();
			showPendingToast();
			initSwitch();
			initColorSwitch();
			initGlassOpacitySlider();
			syncMenuTop();
			initTabSliders();
			syncDropdownValues();
			fitDropdownWidths();
			portalTooltips();
			portalFixedModals();
			portalTopNotices();
			initVersionCheck();
			fixComboPillClick();
			initNavScrollTop();
			injectLoginLogo();
			setTimeout(syncMenuTop, 300);
			setTimeout(initTabSliders, 300);
			setTimeout(syncDropdownValues, 300);
		});
	else {
		flushPending();
		showPendingToast();
		initSwitch();
		initColorSwitch();
		initGlassOpacitySlider();
		syncMenuTop();
		initTabSliders();
		syncDropdownValues();
		fitDropdownWidths();
		portalTooltips();
		portalFixedModals();
		portalTopNotices();
		initVersionCheck();
		fixComboPillClick();
		initNavScrollTop();
		injectLoginLogo();
		setTimeout(syncMenuTop, 300);
		setTimeout(initTabSliders, 300);
		setTimeout(syncDropdownValues, 300);
	}

	/* 定时清除所有内联 opacity（非 0/1 的残留值，luci 的离线/hover
	   样式会残留在接口徽章图标/文字、删除按钮、'取消配置'按钮等元素上，
	   让已连接内容呈半透、被误判为未连接）。统一压回不透明。 */
	setInterval(function () {
		document.querySelectorAll('[style*="opacity"]').forEach(function (el) {
			var o = el.style.opacity;
			if (o && o !== '1' && o !== '0')
				el.style.opacity = '';
		});
	}, 600);

	/* 点击内容区（当前值行）也能稳定展开：LuCI 的 handleClick 虽支持整块
	   点击，但内容区 click 会冒泡到 window 的 closeAllDropdowns，导致
	   打开即关闭（闪烁）。拦截内容区 click，改为以胶囊本身为目标重新
	   触发，走 handleClick 的打开路径（其内部 stopPropagation，不再
	   冒泡到 window）。打开状态下的点击不拦截，LuCI 正常处理关闭。
	   作用于所有表单型 cbi-dropdown（原只匹配 Combobox 试点的
	   liquid-combo-pilot class，该替换已移除导致选择器落空）；
	   排除 .btn/.cbi-button 型（按钮下拉有自己的动作语义） */
	function fixComboPillClick() {
		document.querySelectorAll('.cbi-dropdown:not(.btn):not(.cbi-button) > ul > li[display]').forEach(function (li) {
			if (li.__liquidPillClick)
				return;
			li.__liquidPillClick = true;
			li.addEventListener('click', function (ev) {
				var sb = li.closest('.cbi-dropdown');
				if (!sb || sb.hasAttribute('open'))
					return;
				ev.stopPropagation();
				ev.preventDefault();
				sb.click();
			});
		});
	}

	/* 页面内容动态变化（view 切换、cbi 渲染等）时初始化新出现的 tab 菜单 */
	if (window.MutationObserver) {
		var tabObserver = new MutationObserver(function () {
			initTabSliders();
			syncDropdownValues();
			fitDropdownWidths();
			portalTooltips();
			injectLoginLogo();
			fixComboPillClick();
		});
		document.addEventListener('DOMContentLoaded', function () {
			tabObserver.observe(document.body, { childList: true, subtree: true });
		});
	}

	document.addEventListener('click', function (e) {
		var nav = document.querySelector('#menubar .navigation');
		if (nav && nav.contains(e.target)) {
			scheduleMenuTop();
			return;
		}
		/* 移动端：点击菜单（抽屉）外的任意区域 → 闭合侧边栏。
		   菜单内点击（子菜单展开等）不干预，菜单按钮交给原生 toggle */
		var menu = document.getElementById('mainmenu');
		if (menu && menu.classList.contains('active') && !menu.contains(e.target)) {
			menu.classList.remove('active');
			if (nav)
				nav.classList.remove('active');
		}
	});

	window.addEventListener('resize', syncMenuTop);

	/* 页面资源加载完成（图标 naturalWidth 就绪）后重测下拉宽度，
	   修正带图标选项的宽度估算 */
	window.addEventListener('load', function () {
		document.querySelectorAll('.cbi-dropdown.liquid-dd-fit').forEach(function (dd) {
			dd.classList.remove('liquid-dd-fit');
		});
		fitDropdownWidths();
	});

	/* 全局兜底：任何下拉 open 属性变化（含动态 modal 里尚未经
	   syncDropdownValues 初始化的 dd）都重算定位 —— 修复某些终端
	   下拉只剩一横条（luci 残留 inline 定位 / maxHeight 1px） */
	if (window.MutationObserver) {
		var globalDdObserver = new MutationObserver(function (muts) {
			var need = false;
			muts.forEach(function (m) {
				if (m.type === 'attributes' && m.attributeName === 'open')
					need = true;
			});
			if (!need)
				return;
			adjustDropdownDirection();
			/* luci 触屏分支用 rAF 动画（约 100ms）滚动定位，会在微任务
			   之后再次覆盖 inline 样式 —— 延迟再清理一次，覆盖它
			   （Windows 触屏/Edge 上尤甚） */
			setTimeout(adjustDropdownDirection, 200);
		});
		globalDdObserver.observe(document.documentElement, {
			attributes: true,
			subtree: true,
			attributeFilter: ['open']
		});
	}

	/* ── Overview page memory/storage bars: render used/total text inside
	   the taller progress bar. LuCI's status include renders
	   <div class="cbi-progressbar" title="used / total (pc%)"><div style="width:N%"></div></div>
	   — we inject a centered label from the title attribute and keep it
	   in sync when LuCI re-renders (poll updates). ── */
	function syncBarLabels() {
		document.querySelectorAll('.cbi-section .cbi-progressbar').forEach(function (bar) {
			var label = bar.querySelector('span.liquid-bar-label');
			if (!label) {
				label = document.createElement('span');
				label.className = 'liquid-bar-label';
				bar.appendChild(label);
			}
			/* keep in sync with LuCI's poll updates (title attribute) */
			var txt = bar.title || '';
			if (label.textContent !== txt)
				label.textContent = txt;
		});
	}

	/* overview renders its includes after the view instantiates; poll
	   both the DOM (async view load) and the title updates */
	if (window.MutationObserver) {
		var barObserver = new MutationObserver(function (muts) {
			var need = false;
			muts.forEach(function (m) {
				if (m.type === 'childList' && m.addedNodes && m.addedNodes.length)
					need = true;
				if (m.type === 'attributes' && m.attributeName === 'title')
					need = true;
			});
			if (need)
				syncBarLabels();
		});
		barObserver.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['title']
		});
	}
	setTimeout(syncBarLabels, 500);
	setTimeout(syncBarLabels, 1500);

	/* ── 矮弹窗居中器（限定范围：仅应用提示/待应用等矮弹窗）──
	   安卓浏览器布局视口(innerHeight) 含地址栏区域，与真实可视区
	   不一致（如 811 vs 695），且地址栏展开/收起时动态变化，纯 CSS
	   无法感知 —— 这是 visualViewport API 存在的原因。
	   用法：仅当弹窗内容高度 < 可视区（矮弹窗，居中是刚需）时用
	   visualViewport 像素级居中；超高弹窗（表单类如添加 DHCP）
	   绝不锁定，保持文档流 + overlay 滚动，不影响桌面端功能。 */
	function centerModals() {
		var vv = window.visualViewport;
		var overlay = document.getElementById('modal_overlay');
		var modal = overlay ? overlay.firstElementChild : null;
		if (!modal || document.body.classList.contains('liquid-login'))
			return;
		var vh = vv ? vv.height : window.innerHeight;
		var mh = modal.offsetHeight || 0;
		if (!mh)
			return;
		/* 超高弹窗：不锁定，恢复文档流（margin 顶部对齐 + overlay 滚动） */
		if (mh >= vh - 24) {
			modal.style.position = '';
			modal.style.top = '';
			modal.style.left = '';
			modal.style.margin = '';
			modal.style.transform = '';
			return;
		}
		/* 矮弹窗：visualViewport 像素级精确居中 */
		var vw = vv ? vv.width : window.innerWidth;
		var vx = vv ? vv.offsetLeft : 0;
		var vy = vv ? vv.offsetTop : 0;
		var mw = modal.offsetWidth || 0;
		modal.style.position = 'fixed';
		modal.style.top = Math.round(vy + (vh - mh) / 2) + 'px';
		modal.style.left = Math.round(vx + (vw - mw) / 2) + 'px';
		modal.style.margin = '0';
		modal.style.transform = 'none';
	}

	/* 监听弹窗出现/内容变化（应用提示每秒重建；表单弹窗内容逐步渲染） */
	var modalTimer = null;
	function watchModals() {
		if (document.body.classList.contains('modal-overlay-active')) {
			if (!modalTimer) {
				centerModals();
				modalTimer = setInterval(centerModals, 200);
			}
		} else if (modalTimer) {
			clearInterval(modalTimer);
			modalTimer = null;
		}
	}
	new MutationObserver(watchModals).observe(document.body, {
		attributes: true,
		attributeFilter: ['class']
	});
	window.addEventListener('resize', centerModals);
	if (window.visualViewport)
		window.visualViewport.addEventListener('resize', centerModals);

	/* ── 多实例 section 子卡片（Dropbear 实例等）──────────
	   同一 .cbi-section 内有多个平级 .cbi-section-node 时，给每个
	   节点加 liquid-multi-node（CSS 渲染为独立子卡片+间隔），
	   同时给外层 section 加 liquid-multi-sec（删除按钮收边等）。
	   MutationObserver 覆盖动态增删实例（点击"添加实例"）。 */
	function styleMultiSections() {
		document.querySelectorAll('.cbi-section').forEach(function (sec) {
			var nodes = sec.querySelectorAll(':scope > .cbi-section-node');
			if (nodes.length > 1) {
				nodes.forEach(function (n) {
					n.classList.add('liquid-multi-node');
				});
				sec.classList.add('liquid-multi-sec');
			}
			else {
				sec.classList.remove('liquid-multi-sec');
			}
		});
	}
	styleMultiSections();
	if (window.MutationObserver) {
		var msObs = new MutationObserver(function () {
			styleMultiSections();
		});
		msObs.observe(document.body, { childList: true, subtree: true });
	}

	/* ── 宽表格：优先折叠按钮，再折叠文字 ──────────────────────
	   判定量的是“所有列按自身内容排开所需的宽度”（max-content：按钮
	   横排一行、文字不换行时的宽度），而不是表格实际渲染宽度——auto
	   表格布局在列内容总宽超出表宽时会先压文字列、表格盒本身仍装得下，
	   量实际宽度会漏判，结果就是文字先于按钮被折叠。

	   只要该需求宽度放不下（超出所在容器的内容宽或屏幕宽），就给表格
	   加 liquid-actions-overflow：操作列放开 form.js
	   stabilizeActionColumnWidth 写死的内联列宽、按钮改为每个独占一行，
	   宽度先让给文字；文字拿回后仍不够，才由文字换行兜底（对应 CSS 见
	   cascade.css 末尾段落）。

	   判定始终先移除类再量（量到的才是“按钮横排”的需求），避免加类→
	   不溢出→去类→又溢出的震荡；只处理含操作列的表格，无按钮的表格
	   维持原有排版与横向滚动。 */
	var TBL_CLS = 'liquid-actions-overflow';
	var tblTimer = null;
	var tblRaf = 0;

	/* 元素内容盒宽度：clientWidth 减掉左右 padding（表格比的是父级内容区） */
	function contentBoxWidth(el) {
		var cs = window.getComputedStyle(el);
		return el.clientWidth -
			(parseFloat(cs.paddingLeft) || 0) -
			(parseFloat(cs.paddingRight) || 0);
	}

	/* 临时按内容展开量一次表格的需求宽（列不换行、按钮横排一行），
	   同步读取后立即还原样式，同一帧内不会产生可见闪烁 */
	function needWidth(t) {
		var st = t.style;
		var w0 = st.width, mw0 = st.minWidth, mx0 = st.maxWidth;
		st.width = 'max-content';
		st.minWidth = '0';
		st.maxWidth = 'none';
		var w = t.getBoundingClientRect().width;
		st.width = w0;
		st.minWidth = mw0;
		st.maxWidth = mx0;
		return w;
	}

	/* 在“自然状态”（未折叠 + 操作列内联列宽为空）下执行 fn，随后原样还原。
	   所有样式改动与读数都发生在同一任务内，浏览器不会在中途绘制 ——
	   所以这套测量不会像“120ms 后再改样式”那样被肉眼看到（闪一下）。
	   内联列宽只在测量期间临时清空：量的才是“按钮横排放得下”的真实
	   需求宽（form.js stabilizeActionColumnWidth 写的值在折叠态下是
	   纵排后的 ~63px，会把需求宽算小）。 */
	function inNaturalState(t, fn) {
		var had = t.classList.contains(TBL_CLS);
		if (had) t.classList.remove(TBL_CLS);
		var acts = t.querySelectorAll('th.cbi-section-actions, td.cbi-section-actions');
		var saved = [];
		for (var i = 0; i < acts.length; i++) {
			saved.push([acts[i], acts[i].style.width, acts[i].style.minWidth]);
			acts[i].style.width = '';
			acts[i].style.minWidth = '';
		}
		var ret = fn();
		for (var k = 0; k < saved.length; k++) {
			saved[k][0].style.width = saved[k][1];
			saved[k][0].style.minWidth = saved[k][2];
		}
		if (had) t.classList.add(TBL_CLS);
		return ret;
	}

	function tableOverflows(t) {
		/* 全程在“自然状态”（未折叠 + 操作列内联宽为空）下判定：
		   类的摘挂、内联宽的清还都在同一任务内完成，浏览器中途不绘制
		   → 测量本身不产生可见闪动 */
		return inNaturalState(t, function () {
			var doc = document.documentElement;
			var parent = t.parentElement;
			/* 1) 表格内容已超出表格盒（自身裁剪 / 内部横滚） */
			if (t.scrollWidth > t.clientWidth + 1)
				return true;
			/* 2) 核心：需求宽（按钮横排放得下）> 可用宽 → 从按钮开始折 */
			var need = needWidth(t);
			var avail = parent ? contentBoxWidth(parent) : Infinity;
			if (need > avail + 1 || need > doc.clientWidth + 1)
				return true;
			/* 3) 表格盒右缘已越出屏幕、且文档无法横向滚过去（被祖先裁切） */
			var rect = t.getBoundingClientRect();
			return rect.right > doc.clientWidth + 1 && doc.scrollWidth <= doc.clientWidth + 1;
		});
	}

	/* form.js stabilizeActionColumnWidth 把操作列锁成内联 width/min-width；
	   折叠态下它量到的是“按钮纵排”宽（~63px），解除折叠后这个残留值会
	   卡住按钮 —— 只在“取消折叠”这一刻清掉，平时不动它（否则每次判定
	   都会改动列宽 → 页面闪一下） */
	function clearActionInlineWidths(t) {
		var acts = t.querySelectorAll('th.cbi-section-actions, td.cbi-section-actions');
		for (var i = 0; i < acts.length; i++) {
			if (acts[i].style.width || acts[i].style.minWidth) {
				acts[i].style.width = '';
				acts[i].style.minWidth = '';
			}
		}
	}

	/* 给多列表的单元格回填 data-title（文案取自同列表头 th）——窄屏"单元格
	   自带表头"（td::before { content: attr(data-title) }，Argon 同款）依赖它。
	   概览 include 表（DHCP 租约 / DDNS / WiFi / UPnP …）与 DDNS 服务页的
	   自绘单元格都没有 data-title，这里统一补齐：只补缺失、不覆盖已有、
	   跳过操作列；轮询重绘出的新行下次判定时会补上。attribute 写入不触发
	   我们只监听 childList 的观察者 → 不会造成回调循环。 */
	function backfillCellTitles() {
		var tables = document.querySelectorAll('table.cbi-section-table, table.table');
		for (var i = 0; i < tables.length; i++) {
			var t = tables[i];
			var head = t.querySelector(':scope > thead > tr, :scope > tbody > tr.table-titles, :scope > tbody > tr.cbi-section-table-titles, :scope > tr.table-titles');
			if (!head) continue;
			var ths = head.children;
			var rows = t.querySelectorAll(':scope > tbody > tr');
			for (var r = 0; r < rows.length; r++) {
				var cells = rows[r].children;
				for (var c = 0; c < ths.length && c < cells.length; c++) {
					var cell = cells[c];
					if (cell.tagName !== 'TD' || cell.hasAttribute('data-title') ||
						cell.classList.contains('cbi-section-actions'))
						continue;
					var txt = (ths[c].innerText || ths[c].textContent || '')
						.replace(/\s+/g, ' ').trim();
					if (txt) cell.setAttribute('data-title', txt);
				}
			}
		}
	}

	/* 多列表响应式打标：视口 ≤1100px 时给表格加 .liquid-grid（CSS 端据此
	   切到"一行三列 + 单元格自带表头"）。断点放在这里（matchMedia 单一来源），
	   CSS 只认类、用 !important 压过 ≤854px 既有的 display:flex 规则。
	   1100px 是实测值：1150px 时中间列尚有 6.5 字/行，1100px 掉到 4.3；
	   移动端则是整表按内容宽撑开、只能横向滚动。 */
	function syncGridView() {
		var narrow = window.matchMedia
			? window.matchMedia('(max-width: 1100px)').matches
			: window.innerWidth <= 1100;
		var list = document.querySelectorAll('table.cbi-section-table, table.table');
		for (var i = 0; i < list.length; i++) {
			var t = list[i];
			/* 两类有专属布局的表不打标（CSS 端同样排除，这里保持标记语义一致）：
			   接口页表（td[data-name="_ifacebox"]）、标签/值两列表（td[width="33%"]） */
			var skip = t.querySelector('td[data-name="_ifacebox"], td[width="33%"]');
			if (narrow && !skip && t.querySelector('td'))
				t.classList.add('liquid-grid');
			else
				t.classList.remove('liquid-grid');
		}
	}

	function updateOverflowTables() {
		syncGridView();
		backfillCellTitles();
		var list = document.querySelectorAll('table.cbi-section-table, table.table');
		for (var i = 0; i < list.length; i++) {
			var t = list[i];
			/* 无操作列的表（概览"系统/内存/存储/网络"等标签-值两列表）与
			   折叠逻辑无关：不判定、不写任何样式 —— 与标签-值换行新规则
			   零交集（那套规则只认 td[width="33%"]），稳态下零 DOM 写 */
			if (!t.querySelector('.cbi-section-actions')) {
				if (t.classList.contains(TBL_CLS))
					t.classList.remove(TBL_CLS);
				continue;
			}
			var want = tableOverflows(t);
			var has = t.classList.contains(TBL_CLS);
			if (want && !has) {
				t.classList.add(TBL_CLS);
			} else if (!want && has) {
				t.classList.remove(TBL_CLS);
				clearActionInlineWidths(t);
			}
			/* 其余两种情况（要折且已折 / 不折且未折）净变化为零，不动 DOM */
		}
	}

	function scheduleOverflowTables() {
		/* rAF：在下一帧绘制前完成判定 → 首帧即最终状态，不再看到
		   “先按一行绘制、再瞬间堆叠”的折叠过程（用户反馈的闪一下） */
		if (!tblRaf) {
			tblRaf = window.requestAnimationFrame(function () {
				tblRaf = 0;
				updateOverflowTables();
			});
		}
		/* 仍在 form.js 的 setTimeout(stabilize 列宽) 与其 resize 处理之后
		   补一次校正，拿到的才是内联列宽写完后的稳定状态 */
		if (tblTimer)
			clearTimeout(tblTimer);
		tblTimer = setTimeout(function () {
			tblTimer = null;
			updateOverflowTables();
		}, 120);
	}

	scheduleOverflowTables();
	window.addEventListener('load', scheduleOverflowTables);
	window.addEventListener('resize', scheduleOverflowTables);
	if (window.MutationObserver) {
		/* 行增删、轮询刷新状态文本都会改变表格宽度 */
		new MutationObserver(scheduleOverflowTables)
			.observe(document.body, { childList: true, subtree: true });
	}
})();
