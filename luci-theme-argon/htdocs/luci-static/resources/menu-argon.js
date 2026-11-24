'use strict';
'require baseclass';
'require ui';

/**
 * Native JavaScript slide animation utilities
 * Replaces jQuery slideUp/slideDown functionality with better performance
 */
const SlideAnimations = {
	/**
	 * Animation durations in milliseconds
	 */
	durations: {
		fast: 200,
		normal: 400,
		slow: 600
	},

	getDuration: function(duration) {
		if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
			return 0;

		return typeof duration === 'string' ?
			(this.durations[duration] || this.durations.normal) :
			(duration || this.durations.normal);
	},

	/**
	 * Map to track running animations and their cleanup functions
	 */
	runningAnimations: new WeakMap(),

	/**
	 * Slide element down (show) with animation
	 * @param {Element} element - DOM element to animate
	 * @param {string|number} duration - Animation duration ('fast', 'normal', 'slow' or milliseconds)
	 * @param {function} callback - Optional callback function when animation completes
	 */
	slideDown: function(element, duration, callback) {
		if (!element) {
			console.warn('SlideAnimations.slideDown: No element provided');
			return;
		}
		
		// Stop any existing animation on this element
		this.stop(element);
		
		// Convert duration string to milliseconds
		const animDuration = this.getDuration(duration);
		
		// Store original styles
		const originalStyles = {
			display: element.style.display,
			overflow: element.style.overflow,
			height: element.style.height,
			transition: element.style.transition
		};
		
		// Set initial state for animation
		element.style.display = 'block';
		element.style.overflow = 'hidden';
		element.style.height = '0px';
		element.style.transition = `height ${animDuration}ms ease-out`;
		
		// Force reflow to ensure initial state is applied
		element.offsetHeight;
		
		// Get the target height
		const targetHeight = element.scrollHeight;
		
		// Animate to full height
		element.style.height = targetHeight + 'px';
		
		// Set up cleanup function
		const cleanup = () => {
			element.style.height = originalStyles.height || '';
			element.style.overflow = originalStyles.overflow || '';
			element.style.transition = originalStyles.transition || '';
			
			// Remove from running animations map
			this.runningAnimations.delete(element);
			
			if (callback && typeof callback === 'function') {
				try {
					callback.call(element);
				} catch (e) {
					console.error('SlideAnimations callback error:', e);
				}
			}
		};
		
		// Store cleanup function for potential cancellation
		const timeoutId = setTimeout(cleanup, animDuration);
		this.runningAnimations.set(element, { timeoutId, cleanup });
	},

	/**
	 * Slide element up (hide) with animation
	 * @param {Element} element - DOM element to animate
	 * @param {string|number} duration - Animation duration ('fast', 'normal', 'slow' or milliseconds)
	 * @param {function} callback - Optional callback function when animation completes
	 */
	slideUp: function(element, duration, callback) {
		if (!element) {
			console.warn('SlideAnimations.slideUp: No element provided');
			return;
		}
		
		// Stop any existing animation on this element
		this.stop(element);
		
		// Convert duration string to milliseconds
		const animDuration = this.getDuration(duration);
		
		// Store original styles
		const originalStyles = {
			display: element.style.display,
			overflow: element.style.overflow,
			height: element.style.height,
			transition: element.style.transition
		};
		
		// Get current height before hiding
		const currentHeight = element.scrollHeight;
		
		// Set initial state for animation
		element.style.overflow = 'hidden';
		element.style.height = currentHeight + 'px';
		element.style.transition = `height ${animDuration}ms ease-out`;
		
		// Force reflow to ensure initial state is applied
		element.offsetHeight;
		
		// Animate to zero height
		element.style.height = '0px';
		
		// Set up cleanup function
		const cleanup = () => {
			element.style.display = 'none';
			element.style.height = originalStyles.height || '';
			element.style.overflow = originalStyles.overflow || '';
			element.style.transition = originalStyles.transition || '';
			
			// Remove from running animations map
			this.runningAnimations.delete(element);
			
			if (callback && typeof callback === 'function') {
				try {
					callback.call(element);
				} catch (e) {
					console.error('SlideAnimations callback error:', e);
				}
			}
		};
		
		// Store cleanup function for potential cancellation
		const timeoutId = setTimeout(cleanup, animDuration);
		this.runningAnimations.set(element, { timeoutId, cleanup });
	},

	/**
	 * Stop all running animations on an element
	 * @param {Element} element - DOM element to stop animations on
	 */
	stop: function(element) {
		if (!element) return;
		
		const animationData = this.runningAnimations.get(element);
		if (animationData) {
			// Clear the timeout
			clearTimeout(animationData.timeoutId);
			
			// Run cleanup immediately
			animationData.cleanup();
		}
		
		// Clear transition to immediately stop any CSS animation
		element.style.transition = '';
		
		// Force reflow to apply changes immediately
		element.offsetHeight;
	},

	/**
	 * Check if element has running animation
	 * @param {Element} element - DOM element to check
	 * @returns {boolean} - True if element has running animation
	 */
	isAnimating: function(element) {
		return this.runningAnimations.has(element);
	}
};

/**
 * Argon Theme Menu Module
 * Handles rendering and interaction of the main navigation menu and sidebar
 */
return baseclass.extend({
	/**
	 * Initialize the menu module
	 * Load menu data and trigger rendering
	 */
	__init__: function () {
		this.bindSidebarToggle();
		this.patchDynamicListFocus();
		ui.menu.load().then(L.bind(this.render, this));
	},

	patchDynamicListFocus: function () {
		var prototype = ui.Dropdown && ui.Dropdown.prototype;
		var setFocus = prototype && prototype.setFocus;
		if (typeof setFocus !== 'function' || setFocus.argonDynamicListGuard)
			return;

		var guardedFocus = function (node, item) {
			// A DynamicList change handler can consume a newly created option
			// before Dropdown.createItems() tries to scroll and focus it.
			if (item && !item.parentNode && node && node.closest('.cbi-dynlist'))
				return;
			return setFocus.apply(this, arguments);
		};
		guardedFocus.argonDynamicListGuard = true;
		prototype.setFocus = guardedFocus;
	},

	bindSidebarToggle: function () {
		const trigger = document.querySelector('.showSide');
		const sidebar = document.querySelector('#mainmenu');
		const close = document.querySelector('.sidebar-close');
		const mask = document.querySelector('.darkMask');
		const pane = document.querySelector('.main-right');
		if (!trigger || !sidebar || !close || !mask || !pane)
			return;

		const mobile = window.matchMedia('(max-width: 768px)');
		let open = false;
		let background = [];
		function setOpen(show) {
			open = show && mobile.matches;
			for (const node of [trigger, sidebar, mask, pane])
				node.classList.toggle('active', open);
			trigger.setAttribute('aria-expanded', String(open));
			sidebar.inert = mobile.matches && !open;

			if (open) {
				sidebar.setAttribute('role', 'dialog');
				sidebar.setAttribute('aria-modal', 'true');
				// Allow closing immediately, even while LuCI is loading the menu tree.
				sidebar.style.display = '';
				close.focus();
				background = Array.from(document.querySelectorAll(
					'.skip-link, .main-right > header, #maincontent, .argon-background-layer'
				)).filter(node => !node.inert);
				background.forEach(node => { node.inert = true; });
			} else {
				sidebar.setAttribute('role', 'navigation');
				sidebar.removeAttribute('aria-modal');
				background.forEach(node => { node.inert = false; });
				background = [];
			}
		}

		function dismiss() {
			setOpen(false);
			trigger.focus();
		}

		setOpen(false);
		trigger.addEventListener('click', () => setOpen(true));
		close.addEventListener('click', dismiss);
		mask.addEventListener('click', dismiss);
		// LuCI focuses its overlay when an asynchronous dialog opens. Release
		// the drawer without moving focus away from the incoming dialog.
		document.addEventListener('focusin', ev => {
			if (open && ev.target.closest('#modal_overlay'))
				setOpen(false);
		});
		document.addEventListener('keydown', ev => {
			if (!open || document.body.classList.contains('modal-overlay-active'))
				return;
			if (ev.key === 'Tab') {
				const items = sidebar.querySelectorAll('a[href]:not([inert] *), button:not([inert] *)');
				const first = items[0], last = items[items.length - 1];
				if (document.activeElement === (ev.shiftKey ? first : last)) {
					ev.preventDefault();
					(ev.shiftKey ? last : first).focus();
				}
			} else if (ev.key === 'Escape') {
				ev.preventDefault();
				dismiss();
			}
		});
		mobile.addEventListener('change', () => {
			const hadSidebarFocus = sidebar.contains(document.activeElement);
			const wasMobileControl = document.activeElement === close || document.activeElement === trigger;
			setOpen(false);
			if (mobile.matches && hadSidebarFocus)
				trigger.focus();
			else if (!mobile.matches && wasMobileControl) {
				const target = sidebar.style.display === 'none' ? document.querySelector('#maincontent')
					: sidebar.querySelector('.nav button, .nav a') || sidebar.querySelector('.brand');
				target.focus();
			}
		});
	},

	/**
	 * Main render function for the menu system
	 * @param {Object} tree - Menu tree structure from LuCI
	 */
	render: function (tree) {
		var node = tree;
		var url = '';

		this.renderModeMenu(node);

		// Render tab menu if we're deep enough in the navigation hierarchy
		if (L.env.dispatchpath.length >= 3) {
			for (var i = 0; i < 3 && node; i++) {
				// A cached menu can predate the current page's route.
				node = node.children ? node.children[L.env.dispatchpath[i]] : null;
				url = url + (url ? '/' : '') + L.env.dispatchpath[i];
			}

			if (node) {
				this.renderTabMenu(node, url);
			}
		}
	},

	/**
	 * Handle menu expand/collapse functionality
	 * Manages the sliding animation and active states of menu items
	 * @param {Event} ev - Click event from menu item
	 */
	handleMenuExpand: function (ev) {
		const button = ev.currentTarget;
		const submenu = button.nextElementSibling;
		const expand = button.getAttribute('aria-expanded') !== 'true';
		document.querySelectorAll('#mainmenu .slide-menu.active').forEach(ul => {
			ul.previousElementSibling.setAttribute('aria-expanded', 'false');
			ul.previousElementSibling.classList.remove('active');
			ul.inert = true;
			ul.classList.remove('active');
			SlideAnimations.slideUp(ul, 'fast');
		});
		if (expand) {
			button.setAttribute('aria-expanded', 'true');
			button.classList.add('active');
			submenu.inert = false;
			submenu.classList.add('active');
			SlideAnimations.slideDown(submenu, 'fast');
		}
	},

	/**
	 * Render the main navigation menu
	 * Creates hierarchical menu structure with active states and click handlers
	 * @param {Object} tree - Menu tree node to render
	 * @param {string} url - Base URL for menu items
	 * @param {number} level - Current nesting level (0-based)
	 * @returns {Element} - Generated menu element
	 */
	renderMenuIcon: function (name) {
		var catalog = document.querySelector('meta[name="argon-menu-icons"]');
		var icons = catalog ? (catalog.getAttribute('content') || '').split(/\s+/) : [];
		var filename = /^[a-zA-Z0-9_-]+$/.test(name) && icons.indexOf(name + '.svg') !== -1
			? name + '.svg' : 'default.svg';

		return E('span', {
			'class': 'menu-icon',
			'aria-hidden': 'true',
			'data-icon': filename.slice(0, -4),
			'style': '--menu-icon: url("' + L.media('icon', filename) + '")'
		});
	},

	renderMainMenu: function (tree, url, level) {
		var currentLevel = (level || 0) + 1;
		var menuContainer = E('ul', { 'class': level ? 'slide-menu' : 'nav' });
		var children = ui.menu.getChildren(tree);

		// Don't render empty menus or menus deeper than 2 levels
		if (children.length === 0 || currentLevel > 2) {
			return E([]);
		}

		// Generate menu items for each child
		for (var i = 0; i < children.length; i++) {
			var child = children[i];
			var isActive = (
				(L.env.dispatchpath[currentLevel] === child.name) && 
				(L.env.dispatchpath[currentLevel - 1] === tree.name)
			);
			
			// Recursively render submenu
			var submenu = this.renderMainMenu(child, url + '/' + child.name, currentLevel);
			var hasChildren = submenu.children.length > 0;
			
			var slideClass = hasChildren ? 'slide' : '';
			var menuClass = hasChildren ? 'menu' : 'food';
			if (isActive) {
				slideClass = (slideClass + ' active').trim();
				menuClass += ' active';
			}
			if (hasChildren) {
				submenu.id = 'argon-submenu-' + child.name;
				submenu.classList.toggle('active', isActive);
				submenu.inert = !isActive;
			}

			var menuItem = E('li', { 'class': slideClass || null }, [
				E(hasChildren ? 'button' : 'a', {
					'type': hasChildren ? 'button' : null,
					'href': hasChildren ? null : L.url(url, child.name),
					'click': hasChildren ? this.handleMenuExpand.bind(this) : null,
					'aria-controls': hasChildren ? submenu.id : null,
					'aria-expanded': hasChildren ? String(isActive) : null,
					'aria-current': !hasChildren && isActive ? 'page' : null,
					'class': menuClass,
					'data-title': child.title.replace(/ /g, "_")
				}, currentLevel === 1 ? [this.renderMenuIcon(child.name), _(child.title)] : [_(child.title)]),
				submenu
			]);

			menuContainer.appendChild(menuItem);
		}

		// Append to main menu container if this is the top level
		if (currentLevel === 1) {
			var mainMenuElement = document.querySelector('#mainmenu');
			if (mainMenuElement) {
				mainMenuElement.appendChild(menuContainer);
				mainMenuElement.style.display = '';
			}
		}
		
		return menuContainer;
	},

	renderModeMenu: function (tree) {
		var menu = document.querySelector('#modemenu');
		var children = ui.menu.getChildren(tree);

		for (var i = 0; i < children.length; i++) {
			var isActive = (L.env.requestpath.length ? children[i].name == L.env.requestpath[0] : i == 0);
			if (i > 0)
				menu.appendChild(E([], ['\u00a0|\u00a0']));
			menu.appendChild(E('li', {}, [
				E('a', {
					'href': L.url(children[i].name),
					'class': isActive ? 'active' : null
				}, [_(children[i].title)])
			]));
			if (isActive)
				this.renderMainMenu(children[i], children[i].name);
		}
		if (menu.children.length > 1)
			menu.style.display = '';
	},

	/**
	 * Render tab navigation menu
	 * Creates horizontal tab menu for deeper navigation levels
	 * @param {Object} tree - Menu tree node to render
	 * @param {string} url - Base URL for tab items
	 * @param {number} level - Current nesting level (0-based)
	 * @returns {Element} - Generated tab menu element
	 */
	renderTabMenu: function (tree, url, level) {
		var container = document.querySelector('#tabmenu');
		var currentLevel = (level || 0) + 1;
		var tabContainer = E('ul', { 'class': 'tabs' });
		var children = ui.menu.getChildren(tree);
		var activeNode = null;

		// Don't render empty tab menus
		if (children.length === 0) {
			return E([]);
		}

		// Generate tab items for each child
		for (var i = 0; i < children.length; i++) {
			var child = children[i];
			var isActive = (L.env.dispatchpath[currentLevel + 2] === child.name);
			var activeClass = isActive ? ' active' : '';
			var className = 'tabmenu-item-%s %s'.format(child.name, activeClass);

			var tabItem = E('li', { 'class': className }, [
				E('a', { 'href': L.url(url, child.name) }, [_(child.title)])
			]);
			
			tabContainer.appendChild(tabItem);

			// Store reference to active node for recursive rendering
			if (isActive) {
				activeNode = child;
			}
		}

		// Append tab container to main tab menu element
		if (container) {
			container.appendChild(tabContainer);
			container.style.display = '';

			// Recursively render nested tab menus if there's an active node
			if (activeNode)
				this.renderTabMenu(activeNode, url + '/' + activeNode.name, currentLevel);
		}

		return tabContainer;
	}
});
