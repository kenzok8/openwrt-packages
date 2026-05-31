'use strict';
'require baseclass';
'require ui';

return baseclass.extend({
	__init__() {
		this.suppressClick = null;
		ui.menu.load().then((tree) => this.render(tree));
		this.initNavigationShell();
		this.initDashboardTables();
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

	shouldSuppressClick(ev) {
		const click = this.suppressClick;

		if (!click || Date.now() >= click.until)
			return false;

		const dx = Math.abs(ev.clientX - click.x);
		const dy = Math.abs(ev.clientY - click.y);
		const suppress = dx < 24 && dy < 24;

		if (suppress)
			this.suppressClick = null;

		return suppress;
	},

	bindFastTap(target, handler) {
		let startX = 0;
		let startY = 0;
		let moved = false;

		target.addEventListener('pointerdown', ev => {
			if (ev.pointerType == 'mouse' || ev.button)
				return;

			startX = ev.clientX;
			startY = ev.clientY;
			moved = false;
		}, { passive: true });

		target.addEventListener('pointermove', ev => {
			if (Math.abs(ev.clientX - startX) > 8 || Math.abs(ev.clientY - startY) > 8)
				moved = true;
		}, { passive: true });

		target.addEventListener('pointerup', ev => {
			if (ev.pointerType == 'mouse' || ev.button || moved)
				return;

			this.suppressClick = {
				x: ev.clientX,
				y: ev.clientY,
				until: Date.now() + 500
			};
			ev.preventDefault();
			ev.stopPropagation();
			handler(ev);
		});

		target.addEventListener('click', ev => {
			if (this.shouldSuppressClick(ev)) {
				ev.preventDefault();
				ev.stopPropagation();
				return;
			}

			handler(ev);
		});
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

		document.addEventListener('click', ev => {
			if (!this.shouldSuppressClick(ev))
				return;

			ev.preventDefault();
			ev.stopPropagation();
		}, true);

		const close = () => {
			sidebar.classList.remove('active');
			overlay.classList.remove('active');
			button.classList.remove('active');
			document.body.classList.remove('sidebar-open');
			document.body.style.overflow = '';
			button.setAttribute('aria-expanded', 'false');
		};

		this.bindFastTap(button, () => {
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

		sidebar.addEventListener('pointerdown', ev => {
			const link = ev.target.closest('a[href]');

			if (!link)
				return;

			this.createRipple(ev, link);
		}, { passive: true });

		sidebar.addEventListener('click', ev => {
			const link = ev.target.closest('a[href]');

			if (!link)
				return;

			if (link.getAttribute('href') != '#')
				close();
		});

		document.addEventListener('pointerdown', ev => {
			const target = ev.target.closest('.tabs > li, .cbi-tabmenu > li');

			if (target)
				this.createRipple(ev, target);
		}, { passive: true });

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

	isDashboardPage() {
		const path = (L.env.requestpath || []).join('/');

		return path == '' || path == 'admin' || path == 'admin/dashboard';
	},

	initDashboardTables() {
		if (!this.isDashboardPage())
			return;

		const sync = () => this.updateDashboardTables();

		if (document.readyState == 'loading')
			document.addEventListener('DOMContentLoaded', sync, { once: true });
		else
			sync();

		const target = document.querySelector('#maincontent') || document.body;
		let queued = false;
		const observer = new MutationObserver(() => {
			if (queued)
				return;

			queued = true;
			window.setTimeout(() => {
				queued = false;
				sync();
			}, 100);
		});

		if (target)
			observer.observe(target, { childList: true, subtree: true });
	},

	updateDashboardTables() {
		document.querySelectorAll('.Dashboard, .dashboard-bg.box-s1').forEach(scope => {
			scope.querySelectorAll('.table').forEach(table => {
				const rows = Array.prototype.filter.call(table.querySelectorAll('.tr, tr'), row =>
					row.closest('.table') === table);
				const headerRow = Array.prototype.find.call(table.children, child =>
					child.querySelector && child.querySelector('.th, th')) ||
					rows.find(row => row.querySelector('.th, th'));

				if (!headerRow)
					return;

				const titleCells = headerRow.querySelectorAll('.th, th');
				const titles = Array.prototype.map.call(titleCells, cell => cell.textContent.trim());

				headerRow.classList.add('dashboard-table-titles');

				rows.forEach(row => {
					if (row === headerRow || row.querySelector('.th, th'))
						return;

					const cells = Array.prototype.filter.call(row.children, cell =>
						(cell.classList && cell.classList.contains('td')) || cell.tagName == 'TD');

					cells.forEach((cell, index) => {
						if (!titles[index])
							return;

						if (!cell.getAttribute('data-title'))
							cell.setAttribute('data-title', titles[index]);
					});
				});
			});
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

			const li = E('li', attrs, [
				E('a', linkAttrs, [
					E('span', { 'class': 'nav-menu-title' }, [_(child.title)]),
				]),
				submenu
			]);

			if (!level && hasSubmenu)
				this.bindFastTap(li.firstElementChild, ev => {
					ev.preventDefault();
					this.toggleDropdown(li);
				});

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
