'use strict';
'require baseclass';
'require ui';

return baseclass.extend({
	__init__() {
		ui.menu.load().then((tree) => this.render(tree));
		this.initNavigationShell();
	},

	createRipple(ev, target) {
		const oldRipple = target.querySelector('.ripple');

		if (oldRipple)
			oldRipple.remove();

		const rect = target.getBoundingClientRect();
		const ripple = E('span', { 'class': 'ripple' });

		ripple.style.left = '%dpx'.format(ev.clientX - rect.left);
		ripple.style.top = '%dpx'.format(ev.clientY - rect.top);
		target.appendChild(ripple);
		ripple.addEventListener('animationend', () => ripple.remove());
	},

	toggleDropdown(li) {
		const submenu = Array.prototype.find.call(li.children, child => child.classList.contains('dropdown-menu'));

		if (!submenu)
			return;

		if (li.classList.contains('open')) {
			submenu.style.height = '%dpx'.format(submenu.scrollHeight);
			submenu.offsetHeight;
			li.classList.remove('open');
			submenu.style.height = '0px';
		}
		else {
			this.closeOtherMenus(li);
			li.classList.add('open');
			submenu.style.height = '%dpx'.format(submenu.scrollHeight);
		}
	},

	closeOtherMenus(currentMenu) {
		document.querySelectorAll('#topmenu > li.open').forEach(menu => {
			if (menu === currentMenu)
				return;

			const submenu = menu.querySelector('.dropdown-menu');

			if (!submenu)
				return;

			submenu.style.height = '%dpx'.format(submenu.scrollHeight);
			submenu.offsetHeight;
			submenu.style.height = '0px';
			menu.classList.remove('open');
		});
	},

	initNavigationShell() {
		const button = document.querySelector('.menu-btn');
		const sidebar = document.querySelector('.sidebar');
		const overlay = document.querySelector('.sidebar-overlay');
		const header = document.querySelector('header');
		const collapsedQuery = window.matchMedia('(max-width: 854px), (max-device-width: 854px)');

		if (header) {
			const updateHeaderShadow = () => {
				header.classList.toggle('with-shadow', collapsedQuery.matches && window.scrollY > 8);
			};

			updateHeaderShadow();
			window.addEventListener('scroll', updateHeaderShadow, { passive: true });
			collapsedQuery.addEventListener('change', updateHeaderShadow);
		}

		if (!button || !sidebar || !overlay)
			return;

		const close = () => {
			sidebar.classList.remove('active');
			overlay.classList.remove('active');
			button.classList.remove('active');
			document.body.classList.remove('sidebar-open');
			document.body.style.overflow = '';
			button.setAttribute('aria-expanded', 'false');
		};

		button.addEventListener('click', () => {
			sidebar.classList.toggle('active');
			overlay.classList.toggle('active');
			const isOpen = sidebar.classList.contains('active');

			button.classList.toggle('active', isOpen);
			document.body.classList.toggle('sidebar-open', isOpen);
			document.body.style.overflow = isOpen ? 'hidden' : '';
			button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
		});

		overlay.addEventListener('click', close);

		document.addEventListener('keydown', ev => {
			if (ev.key == 'Escape')
				close();
		});

		sidebar.addEventListener('click', ev => {
			const link = ev.target.closest('a[href]');

			if (!link)
				return;

			this.createRipple(ev, link);

			if (link.getAttribute('href') != '#')
				close();
		});

		document.addEventListener('click', ev => {
			const target = ev.target.closest('.tabs > li, .cbi-tabmenu > li');

			if (target)
				this.createRipple(ev, target);
		});

		sidebar.addEventListener('mouseover', ev => {
			const link = ev.target.closest('.nav a');
				const title = link ? link.querySelector('.nav-menu-title') : null;

				if (title && title.scrollWidth > title.clientWidth)
					title.scrollTo({ left: title.scrollWidth - title.clientWidth, behavior: 'smooth' });
			});

		sidebar.addEventListener('mouseout', ev => {
			const link = ev.target.closest('.nav a');
				const title = link ? link.querySelector('.nav-menu-title') : null;

				if (title && !link.contains(ev.relatedTarget))
					title.scrollTo({ left: 0, behavior: 'smooth' });
			});
	},

	render(tree) {
		let node = tree;
		let url = '';

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

	renderTabMenu(tree, url, level) {
		const container = document.querySelector('#tabmenu');
		const ul = E('ul', { 'class': 'tabs' });
		const children = ui.menu.getChildren(tree);
		let activeNode = null;

		children.forEach(child => {
			const isActive = (L.env.dispatchpath[3 + (level || 0)] == child.name);
			const activeClass = isActive ? ' active' : '';
			const className = 'tabmenu-item-%s %s'.format(child.name, activeClass);

			ul.appendChild(E('li', { 'class': className }, [
				E('a', { 'href': L.url(url, child.name) }, [_(child.title)])]));

			if (isActive)
				activeNode = child;
		});

		if (ul.children.length == 0)
			return E([]);

		container.appendChild(ul);
		container.style.display = '';

		if (activeNode)
			this.renderTabMenu(activeNode, url + '/' + activeNode.name, (level || 0) + 1);

		return ul;
	},

	renderMainMenu(tree, url, level) {
		const ul = level ? E('ul', { 'class': 'dropdown-menu' }) : document.querySelector('#topmenu');
		const children = ui.menu.getChildren(tree);

		if (children.length == 0 || level > 1)
			return E([]);

		children.forEach(child => {
			const submenu = this.renderMainMenu(child, url + '/' + child.name, (level || 0) + 1);
			const itemPath = (url + '/' + child.name).replace(/^\/+/, '');
			const currentPath = L.env.requestpath.join('/');
			const isActive = currentPath == itemPath || currentPath.indexOf(itemPath + '/') == 0;
			const hasSubmenu = !!submenu.firstElementChild;
			const subclass = [
				hasSubmenu ? 'dropdown' : '',
				isActive ? 'active' : '',
				(!level && hasSubmenu && isActive) ? 'open' : ''
			].filter(Boolean).join(' ');
			const linkclass = (!level && hasSubmenu) ? 'menu' : '';
			const linkurl = hasSubmenu ? '#' : L.url(url, child.name);
			const attrs = {
				'class': subclass,
				'data-path': itemPath
			};
			const linkAttrs = {
				'class': linkclass,
				'href': linkurl
			};

			if (!level && hasSubmenu) {
				linkAttrs.click = ev => {
					ev.preventDefault();
					this.toggleDropdown(ev.currentTarget.parentNode);
				};
			}

			const li = E('li', attrs, [
				E('a', linkAttrs, [
					E('span', { 'class': 'nav-menu-title' }, [_(child.title)]),
				]),
				submenu
			]);

			if (!level && hasSubmenu && isActive)
				submenu.style.height = 'auto';

			ul.appendChild(li);
		});

		ul.style.display = '';

		return ul;
	},

	renderModeMenu(tree) {
		const ul = document.querySelector('#modemenu');
		const children = ui.menu.getChildren(tree);

		children.forEach((child, index) => {
			const isActive = L.env.requestpath.length
				? child.name === L.env.requestpath[0]
				: index === 0;

			ul.appendChild(E('li', { 'class': isActive ? 'active' : '' }, [
				E('a', { 'href': L.url(child.name) }, [_(child.title)])
			]));

			if (isActive)
				this.renderMainMenu(child, child.name);
		});

		if (ul.children.length > 1)
			ul.style.display = '';
	}
});
