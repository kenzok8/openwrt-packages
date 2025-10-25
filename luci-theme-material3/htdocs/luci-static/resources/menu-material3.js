'use strict';
'require baseclass';
'require ui';

return baseclass.extend({
	__init__: function () {
		ui.menu.load().then(L.bind(this.render, this));
		this.initMenuToggle();
		this.initRippleEffect();
		this.initHeaderShadow();
	},

	createRipple: function (event, target) {
		// 移除已有的水波纹
		var oldRipple = target.querySelector('.ripple');
		if (oldRipple) {
			oldRipple.remove();
		}

		// 创建并设置水波纹
		var ripple = document.createElement('div');
		ripple.className = 'ripple';
		ripple.style.left = event.clientX - target.getBoundingClientRect().left + 'px';
		ripple.style.top = event.clientY - target.getBoundingClientRect().top + 'px';

		// 添加水波纹并设置自动移除
		target.appendChild(ripple);
		ripple.addEventListener('animationend', function () {
			ripple.remove();
		});
	},

	initMenuToggle: function () {
		var menuBtn = document.querySelector('.menu-btn');
		var sidebar = document.querySelector('.sidebar');
		var body = document.body;

		// 创建遮罩层
		var overlay = document.createElement('div');
		overlay.className = 'sidebar-overlay';
		document.body.appendChild(overlay);

		if (menuBtn && sidebar) {
			// 点击菜单按钮
			menuBtn.addEventListener('click', function () {
				menuBtn.classList.toggle('active');
				sidebar.classList.toggle('active');
				overlay.classList.toggle('active');
				body.style.overflow = sidebar.classList.contains('active') ? 'hidden' : '';
			});

			// 点击遮罩层关闭菜单
			overlay.addEventListener('click', function () {
				menuBtn.classList.remove('active');
				sidebar.classList.remove('active');
				overlay.classList.remove('active');
				body.style.overflow = '';
			});
		}
	},

	// 关闭其他展开的菜单
	closeOtherMenus: function (currentMenu) {
		var openMenus = document.querySelectorAll('#topmenu > li.open');

		openMenus.forEach(function (menu) {
			if (menu !== currentMenu) {
				var submenu = menu.querySelector('.dropdown-menu');
				if (submenu) {
					// 先设置实际高度，以便动画正常工作
					submenu.style.height = submenu.scrollHeight + 'px';
					// 强制重排
					submenu.offsetHeight;
					// 开始收起动画
					submenu.style.height = '0px';
					menu.classList.remove('open');
				}
			}
		});
	},

	render: function (tree) {
		var node = tree,
			url = '';

		this.renderModeMenu(tree);

		if (L.env.dispatchpath.length >= 3) {
			for (var i = 0; i < 3 && node; i++) {
				node = node.children[L.env.dispatchpath[i]];
				url = url + (url ? '/' : '') + L.env.dispatchpath[i];
			}

			if (node)
				this.renderTabMenu(node, url);
		}
	},

	renderTabMenu: function (tree, url, level) {
		var container = document.querySelector('#tabmenu'),
			ul = E('ul', { 'class': 'tabs' }),
			children = ui.menu.getChildren(tree),
			activeNode = null;

		for (var i = 0; i < children.length; i++) {
			var isActive = (L.env.dispatchpath[3 + (level || 0)] == children[i].name),
				activeClass = isActive ? ' active' : '',
				className = 'tabmenu-item-%s %s'.format(children[i].name, activeClass);

			ul.appendChild(E('li', { 'class': className }, [
				E('a', { 'href': L.url(url, children[i].name) }, [children[i].name === 'nas' ? 'NAS' : _(children[i].title)])]));

			if (isActive)
				activeNode = children[i];
		}

		if (ul.children.length == 0)
			return E([]);

		container.appendChild(ul);
		container.style.display = '';

		if (activeNode)
			this.renderTabMenu(activeNode, url + '/' + activeNode.name, (level || 0) + 1);

		return ul;
	},

	renderMainMenu: function (tree, url, level) {
		var self = this;
		var ul = level ? E('ul', { 'class': 'dropdown-menu' }) : document.querySelector('#topmenu'),
			children = ui.menu.getChildren(tree);

		if (children.length == 0 || level > 1)
			return E([]);

		for (var i = 0; i < children.length; i++) {
			var submenu = this.renderMainMenu(children[i], url + '/' + children[i].name, (level || 0) + 1),
				subclass = (!level && submenu.firstElementChild) ? 'dropdown' : null,
				linkclass = (!level && submenu.firstElementChild) ? 'menu' : null,
				linkurl = submenu.firstElementChild ? '#' : L.url(url, children[i].name);

			var currentPath = L.env.requestpath.join('/');
			var itemPath = (url + '/' + children[i].name).replace(/^\/+/, '');
			var isActive = currentPath.startsWith(itemPath);

			if (isActive && submenu.firstElementChild) {
				subclass = 'dropdown open active';
				// 直接设置展开状态
				submenu.style.display = 'block';
				submenu.style.height = 'auto';
			}
			else if (isActive) {
				subclass = 'active';
			}
			else if (submenu.firstElementChild) {
				subclass = 'dropdown';
				submenu.style.height = '0px';
			}

			var li = E('li', {
				'class': subclass,
				'data-path': itemPath
			}, [
				E('a', {
					'class': linkclass,
					'href': linkurl,
					'click': (function (submenu, hasSubmenu, targetUrl, ev) {
						// 添加水波纹效果
						self.createRipple(ev, ev.currentTarget);

						if (hasSubmenu) {
							ev.preventDefault();
							ev.stopPropagation();

							var parentLi = ev.currentTarget.parentNode;
							var dropdownMenu = submenu;

							if (parentLi.classList.contains('open')) {
								// 先获取当前高度
								dropdownMenu.style.height = dropdownMenu.scrollHeight + 'px';
								// 强制重排
								dropdownMenu.offsetHeight;
								// 开始收起动画
								parentLi.classList.remove('open');
								dropdownMenu.style.height = '0px';
							} else {
								self.closeOtherMenus(parentLi);
								parentLi.classList.add('open');
								// 移除auto和display设置，以便动画生效
								dropdownMenu.style.display = '';
								dropdownMenu.style.height = dropdownMenu.scrollHeight + 'px';
							}
						}
						else if (targetUrl) {
							location.href = targetUrl;
						}
					}).bind(null, submenu, !!submenu.firstElementChild, linkurl)
				}, [children[i].name === 'nas' ? 'NAS' : _(children[i].title)]),
				submenu
			]);

			ul.appendChild(li);
		}

		ul.style.display = '';

		return ul;
	},

	renderModeMenu: function (tree) {
		var ul = document.querySelector('#modemenu'),
			children = ui.menu.getChildren(tree);

		for (var i = 0; i < children.length; i++) {
			var isActive = (L.env.requestpath.length ? children[i].name == L.env.requestpath[0] : i == 0);

			ul.appendChild(E('li', { 'class': isActive ? 'active' : null }, [
				E('a', { 'href': L.url(children[i].name) }, [children[i].name === 'nas' ? 'NAS' : _(children[i].title)])
			]));

			if (isActive)
				this.renderMainMenu(children[i], children[i].name);
		}

		if (ul.children.length > 1)
			ul.style.display = '';
	},

	initRippleEffect: function () {
		var self = this;
		document.addEventListener('click', function (e) {
			// 排除一级菜单的点击，因为它们已经在自己的点击事件中处理了水波纹
			var target = e.target.closest('.dropdown-menu>li>a, .tabs>li, .cbi-tabmenu>li');
			if (!target) return;

			self.createRipple(e, target);
		});
	},

	initHeaderShadow: function () {
		var header = document.querySelector('header');
		var scrollThreshold = 10; // 滚动阈值

		window.addEventListener('scroll', function () {
			if (window.scrollY > scrollThreshold) {
				header.classList.add('with-shadow');
			} else {
				header.classList.remove('with-shadow');
			}
		});
	}
});
