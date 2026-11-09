'use strict';
'require baseclass';
'require ui';

/* Liquid theme menu renderer, based on luci-theme-openwrt-2020's
 * menu-openwrt2020.js (Apache 2.0). Renders the left sidebar into
 * #mainmenu, the mode menu into #modemenu and sub page tabs into
 * #tabmenu. */

return baseclass.extend({
	__init__() {
		ui.menu.load().then((tree) => this.render(tree));
	},

	render(tree) {
		let node = tree;
		let url = '';

		this.renderModeMenu(node);

		if (L.env.dispatchpath.length >= 3) {
			for (var i = 0; i < 3 && node; i++) {
				node = node.children[L.env.dispatchpath[i]];
				url = url + (url ? '/' : '') + L.env.dispatchpath[i];
			}

			if (node)
				this.renderTabMenu(node, url);
		}

		document.querySelector('#menubar > .navigation')
			.addEventListener('click', ui.createHandlerFn(this, 'handleSidebarToggle'));

		this.initMenuIndicator();
	},

	/* hover 追踪：一个玻璃滑块平滑跟随鼠标在一级菜单项间移动 */
	initMenuIndicator() {
		const menu = document.querySelector('#mainmenu');

		if (!menu)
			return;

		const indicator = E('div', { 'class': 'liquid-menu-indicator' });
		menu.appendChild(indicator);

		const items = menu.querySelectorAll('ul.mainmenu.l1 > li');

		/* 追踪鼠标位置，供 handleMenuExpand 展开/折叠后重新定位滑块 */
		var self = this;
		self._menu = menu;
		self._indicator = indicator;
		self._lastX = 0;
		self._lastY = 0;

		menu.addEventListener('mousemove', function (ev) {
			self._lastX = ev.clientX;
			self._lastY = ev.clientY;
		});

		menu.addEventListener('mouseleave', function () {
			menu.classList.remove('liquid-menu-hovering');
		});

		menu.addEventListener('scroll', function () {
			menu.classList.remove('liquid-menu-hovering');
			menu.querySelectorAll('ul.mainmenu.l2.liquid-sub-hovering').forEach(function (ul) {
				ul.classList.remove('liquid-sub-hovering');
			});
		});

		items.forEach(function (li) {
			li.addEventListener('mouseenter', function () {
				if (li.classList.contains('selected')) {
					/* 当前菜单已有自身高亮，滑块滑到它时不叠加，避免遮挡 */
					menu.classList.remove('liquid-menu-hovering');
					return;
				}

				const a = li.querySelector(':scope > a');
				const menuRect = menu.getBoundingClientRect();
				const aRect = a.getBoundingClientRect();

				indicator.style.transform =
					'translateY(%dpx)'.format(aRect.top - menuRect.top + menu.scrollTop);
				indicator.style.height = '%dpx'.format(aRect.height);
				menu.classList.add('liquid-menu-hovering');
			});
		});

		/* 二级菜单追踪滑块：每个展开的 ul.l2 一个 */
		menu.querySelectorAll('ul.mainmenu.l2').forEach(function (ul) {
			const sub = E('div', { 'class': 'liquid-sub-indicator' });
			ul.appendChild(sub);

			ul.querySelectorAll(':scope > li').forEach(function (li) {
				li.addEventListener('mouseenter', function () {
					if (li.classList.contains('selected')) {
						/* 当前选中项已有胶囊高亮，滑块不叠加 */
						ul.classList.remove('liquid-sub-hovering');
						return;
					}

					const a = li.querySelector(':scope > a');
					const ulRect = ul.getBoundingClientRect();
					const aRect = a.getBoundingClientRect();

					sub.style.transform = 'translateY(%dpx)'.format(aRect.top - ulRect.top);
					sub.style.height = '%dpx'.format(aRect.height);
					ul.classList.add('liquid-sub-hovering');
				});
			});

			ul.addEventListener('mouseleave', function () {
				ul.classList.remove('liquid-sub-hovering');
			});
		});
	},

	/* 展开/折叠后，用当前鼠标位置重新定位一级滑块。
	   点击切换分类时菜单项垂直位移，但鼠标未离开——mouseenter
	   不触发，滑块停留在旧位置。此处用最近的鼠标坐标查出
	   当前悬停的 li 并重算 translateY。 */
	_repositionMenuIndicator() {
		var menu = this._menu;
		var indicator = this._indicator;
		if (!menu || !indicator || !menu.classList.contains('liquid-menu-hovering'))
			return;

		var hovered = document.elementFromPoint(this._lastX, this._lastY);
		if (!hovered)
			return;

		var li = hovered.closest('ul.mainmenu.l1 > li');
		if (!li || li.classList.contains('selected')) {
			menu.classList.remove('liquid-menu-hovering');
			return;
		}

		var a = li.querySelector(':scope > a');
		if (!a)
			return;

		var menuRect = menu.getBoundingClientRect();
		var aRect = a.getBoundingClientRect();
		indicator.style.transform =
			'translateY(%dpx)'.format(aRect.top - menuRect.top + menu.scrollTop);
		indicator.style.height = '%dpx'.format(aRect.height);
	},

	handleMenuExpand(ev) {
		const a = ev.target;
		const li = a.parentNode;
		const ul1 = li.parentNode;
		const ul2 = a.nextElementSibling;

		/* 点击已展开的一级菜单 → 折叠（收起其子菜单） */
		if (li.classList.contains('active') && ul2 && ul2.children.length > 0) {
			li.classList.remove('active');
			a.blur();
			this._repositionMenuIndicator();
			ev.preventDefault();
			ev.stopPropagation();
			return;
		}

		/* 未展开：收起其他已展开的一级菜单，再展开当前 */
		document.querySelectorAll('ul.mainmenu.l1 > li.active').forEach(other => {
			if (other !== li)
				other.classList.remove('active');
		});

		if (!ul2)
			return;

		if (ul2.parentNode.offsetLeft + ul2.offsetWidth <= ul1.offsetLeft + ul1.offsetWidth)
			ul2.classList.add('align-left');

		ul1.classList.add('active');
		li.classList.add('active');
		a.blur();

		/* 展开/折叠后菜单项垂直位移，滑块位置需跟着更新 */
		this._repositionMenuIndicator();

		ev.preventDefault();
		ev.stopPropagation();
	},

	renderMainMenu(tree, url, level) {
		const l = (level || 0) + 1;
		const ul = E('ul', { 'class': 'mainmenu l%d'.format(l) });
		const children = ui.menu.getChildren(tree);

		if (children.length == 0 || l > 2)
			return E([]);

		children.forEach(child => {
			/* 当前所在一级菜单：高亮(selected)并展开其二级菜单(active)；
			   其余一级菜单保持收起，点击才展开 */
			const isActive = (L.env.dispatchpath[l] == child.name);
			const activeClass = 'mainmenu-item-%s%s'.format(
				child.name, isActive ? ' selected active' : '');

			ul.appendChild(E('li', { 'class': activeClass }, [
				E('a', {
					'href': L.url(url, child.name),
					'data-title': child.title,
					'click': (l == 1) ? ui.createHandlerFn(this, 'handleMenuExpand') : ''
				}, [
					_(child.title)
				]),
				this.renderMainMenu(child, url + '/' + child.name, l)
			]));
		});

		if (l == 1)
			document.querySelector('#mainmenu').appendChild(E('div', [ ul ]));

		return ul;
	},

	renderModeMenu(tree) {
		const menu = document.querySelector('#modemenu');
		const children = ui.menu.getChildren(tree);

		children.forEach((child, index) => {
			const isActive = L.env.requestpath.length
				? child.name === L.env.requestpath[0]
				: index === 0;

			if (index > 0)
				menu.appendChild(E([], ['\u00a0|\u00a0']));

			menu.appendChild(E('div', { 'class': isActive ? 'active' : '' }, [
				E('a', { href: L.url(child.name) }, [
					_(child.title)
				])
			]));

			if (isActive)
				this.renderMainMenu(child, child.name);
		});

		if (menu.children.length > 1)
			menu.style.display = '';
	},

	renderTabMenu(tree, url, level) {
		const container = document.querySelector('#tabmenu');
		const l = (level || 0) + 1;
		const ul = E('ul', { 'class': 'cbi-tabmenu' });
		const children = ui.menu.getChildren(tree);
		let activeNode = null;

		if (children.length == 0)
			return E([]);

		children.forEach(child => {
			const isActive = (L.env.dispatchpath[l + 2] == child.name);
			const activeClass = isActive ? ' cbi-tab' : '';
			const className = 'tabmenu-item-%s %s'.format(child.name, activeClass);

			ul.appendChild(E('li', { 'class': className }, [
				E('a', { 'href': L.url(url, child.name) }, [
					_(child.title)
				])
			]));

			if (isActive)
				activeNode = child;
		});

		container.appendChild(ul);
		container.style.display = '';

		if (activeNode)
			container.appendChild(this.renderTabMenu(activeNode, url + '/' + activeNode.name, l));

		return ul;
	},

	handleSidebarToggle(ev) {
		const btn = ev.currentTarget;
		const bar = document.querySelector('#mainmenu');

		if (btn.classList.contains('active')) {
			btn.classList.remove('active');
			bar.classList.remove('active');
		}
		else {
			btn.classList.add('active');
			bar.classList.add('active');
		}
	}
});
