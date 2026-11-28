'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require rpc';
'require ui';
'require network';

var callGlassWallpapers = rpc.declare({
	object: 'glass',
	method: 'wallpapers',
	expect: { wallpapers: [], categories: [] }
});

var callGlassCurrent = rpc.declare({
	object: 'glass',
	method: 'current',
	expect: { current: null }
});

var callGlassDownload = rpc.declare({
	object: 'glass',
	method: 'download',
	params: ['id', 'url', 'direct']
});

var callGlassRemove = rpc.declare({
	object: 'glass',
	method: 'remove'
});

var callGlassGetSource = rpc.declare({
	object: 'glass',
	method: 'getSource'
});

var callGlassSetSource = rpc.declare({
	object: 'glass',
	method: 'setSource',
	params: ['source']
});

var callGlassNextBatch = rpc.declare({
	object: 'glass',
	method: 'nextBatch'
});

return view.extend({
	wallpapers: [],
	categories: [],
	currentBg: null,
	selectedCategory: 'all',
	currentSource: 'picsum',
	currentBatch: '',

	load: function () {
		return Promise.all([
			uci.load('glass'),
			L.resolveDefault(fs.list('/www/luci-static/glass/background'), []),
			L.resolveDefault(callGlassWallpapers(), { wallpapers: [], categories: [] }),
			L.resolveDefault(callGlassCurrent(), { current: null }),
			L.resolveDefault(callGlassGetSource(), { source: 'picsum' }),
			L.resolveDefault(network.getDevices(), [])
		]);
	},

	render: function (data) {
		var self = this;
		var bgFiles = (data[1] || []).filter(function(f) {
			return f.name && !f.name.startsWith('.') && /\.(jpe?g|png|gif|webp|mp4|webm)$/i.test(f.name);
		});
		var hasBg = bgFiles.length > 0;
		var bgName = hasBg ? bgFiles[0].name : null;

		// Check if wallpaper is enabled
		var bgEnable = uci.get('glass', 'global', 'bg_enable') || '0';
		self.bgEnabled = (bgEnable === '1');

		// Get source and batch info
		self.currentSource = (data[4] && data[4].source) ? data[4].source : 'picsum';

		// Handle wallpapers data with source and batch
		if (data[2] && data[2].wallpapers) {
			self.wallpapers = data[2].wallpapers;
			self.categories = data[2].categories || [];
			self.currentBatch = data[2].batch || '';
			// Use source from server response
			if (data[2].source) {
				self.currentSource = data[2].source;
			}
		} else if (Array.isArray(data[2])) {
			self.wallpapers = data[2];
			self.categories = [
				{ id: 'all', name: 'All' },
				{ id: 'nature', name: 'Nature' },
				{ id: 'abstract', name: 'Abstract' },
				{ id: 'technology', name: 'Technology' },
				{ id: 'minimal', name: 'Minimal' },
				{ id: 'gradient', name: 'Gradient' }
			];
		} else {
			self.wallpapers = [];
			self.categories = [];
		}

		// Only show background if enabled
		if (self.bgEnabled && data[3] && data[3].current) {
			self.currentBg = data[3].current;
		} else if (self.bgEnabled && hasBg && bgName) {
			self.currentBg = { name: bgName, type: 'image', path: '/luci-static/glass/background/' + bgName };
		} else {
			self.currentBg = null;
		}

		var m, s, o;

		m = new form.Map('glass', _('Glass Theme'),
			_('Configure the appearance of the Glass theme. Changes take effect after saving and refreshing the page.'));

		/* ── General ── */
		s = m.section(form.NamedSection, 'global', 'global', _('General'));
		s.anonymous = true;

		o = s.option(form.ListValue, 'mode', _('Theme mode'),
			_('Controls the overall appearance. "Normal" follows the system preference.'));
		o.value('normal', _('Auto (follow system)'));
		o.value('light', _('Light'));
		o.value('dark', _('Dark'));
		o.default = 'normal';

		o = s.option(form.Flag, 'status_bar', _('Header status bar'),
			_('Show live system stats (CPU, RAM, network, uptime) in the header. Disable to reduce resource usage on low-end devices.'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'status_device', _('Throughput device'),
			_('Network device the header throughput indicator monitors. Leave empty to detect the WAN device automatically. With PPPoE and hardware offloading, pick the physical WAN port (e.g. wan) instead of pppoe-wan.'));
		o.placeholder = _('Auto-detect');
		o.optional = true;
		o.depends('status_bar', '1');
		(data[5] || []).forEach(function(dev) {
			var name = dev.getName();
			if (name && name !== 'lo')
				o.value(name);
		});
		o.validate = function(section_id, value) {
			if (!value || /^[A-Za-z0-9_.:@-]{1,15}$/.test(value))
				return true;
			return _('Expecting a network device name');
		};

		o = s.option(form.Flag, 'menu_accordion', _('Accordion mode'),
			_('Keep only one menu section expanded: opening a menu automatically collapses the others.'));
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.ListValue, 'font_size', _('Base font size'),
			_('Scales all text in the theme. Larger values improve readability on high-DPI displays.'));
		o.value('13', _('Small (13px)'));
		o.value('14', _('Normal (14px)'));
		o.value('16', _('Large (16px)'));
		o.value('18', _('Extra Large (18px)'));
		o.default = '14';

		/* ── Colors ── */
		s = m.section(form.NamedSection, 'global', 'global', _('Accent Colors'));
		s.anonymous = true;

		o = s.option(form.Value, 'primary', _('Primary color (light mode)'),
			_('Accent color used for active elements, links, and buttons in light mode.'));
		o.default = '#007AFF';
		o.placeholder = '#007AFF';
		o.datatype = 'string';
		o.renderWidget = function(section_id, option_index, cfgvalue) {
			var el = form.Value.prototype.renderWidget.apply(this, arguments);
			var input = el.querySelector('input');
			if (input) {
				input.type = 'color';
				input.style.height = '2.5rem';
				input.style.cursor = 'pointer';
			}
			return el;
		};

		o = s.option(form.Value, 'dark_primary', _('Primary color (dark mode)'),
			_('Accent color used for active elements, links, and buttons in dark mode.'));
		o.default = '#0A84FF';
		o.placeholder = '#0A84FF';
		o.datatype = 'string';
		o.renderWidget = function(section_id, option_index, cfgvalue) {
			var el = form.Value.prototype.renderWidget.apply(this, arguments);
			var input = el.querySelector('input');
			if (input) {
				input.type = 'color';
				input.style.height = '2.5rem';
				input.style.cursor = 'pointer';
			}
			return el;
		};

		/* ── Glass Effects (Light Mode) ── */
		s = m.section(form.NamedSection, 'global', 'global', _('Glass Effects — Light Mode'));
		s.anonymous = true;

		o = s.option(form.Value, 'blur', _('Blur intensity (px)'),
			_('Backdrop blur radius for glass panels. Higher values create a more frosted appearance.'));
		o.default = '20';
		o.placeholder = '20';
		o.datatype = 'range(0,50)';

		o = s.option(form.Value, 'transparency', _('Panel transparency'),
			_('Background opacity of glass panels (0 = fully transparent, 1 = fully opaque).'));
		o.default = '0.72';
		o.placeholder = '0.72';
		o.datatype = 'string';

		/* ── Glass Effects (Dark Mode) ── */
		s = m.section(form.NamedSection, 'global', 'global', _('Glass Effects — Dark Mode'));
		s.anonymous = true;

		o = s.option(form.Value, 'blur_dark', _('Blur intensity (px)'),
			_('Backdrop blur radius for glass panels in dark mode.'));
		o.default = '25';
		o.placeholder = '25';
		o.datatype = 'range(0,50)';

		o = s.option(form.Value, 'transparency_dark', _('Panel transparency'),
			_('Background opacity of glass panels in dark mode (0 = fully transparent, 1 = fully opaque).'));
		o.default = '0.30';
		o.placeholder = '0.30';
		o.datatype = 'string';

		/* ── Background ── */
		s = m.section(form.NamedSection, 'global', 'global', _('Background'));
		s.anonymous = true;

		o = s.option(form.DummyValue, '_bg_info', _('Current background'));
		o.rawhtml = true;
		o.cfgvalue = function () {
			var html = '';
			if (self.currentBg) {
				html += '<div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;">';
				html += '<div style="width:120px;height:68px;border-radius:8px;overflow:hidden;background:var(--color-bg-secondary);display:flex;align-items:center;justify-content:center;">';
				if (self.currentBg.type === 'image') {
					html += '<img src="' + self.currentBg.path + '" style="width:100%;height:100%;object-fit:cover;" />';
				} else {
					html += '<span style="font-size:2rem;">▶</span>';
				}
				html += '</div>';
				html += '<div><div style="color:var(--color-success);font-weight:500;">' + _('Active') + ': ' + self.currentBg.name + '</div>';
				html += '<button class="cbi-button cbi-button-remove" style="margin-top:0.5rem;" data-action="remove-bg">' + _('Remove Background') + '</button></div>';
				html += '</div>';
			} else {
				html += '<div style="color:var(--color-text-secondary);margin-bottom:1rem;">';
				html += _('No background set. Select a wallpaper from the online gallery below, or upload a custom image via SCP to /www/luci-static/glass/background/');
				html += '</div>';
			}
			return html;
		};

		// Enable Wallpaper Switch
		o = s.option(form.Flag, 'bg_enable', _('Enable wallpaper'),
			_('Enable or disable the wallpaper feature. When disabled, no background image will be shown.'));
		o.default = '0';
		o.cfgvalue = function(section_id) {
			var value = uci.get('glass', section_id, 'bg_enable');
			return value || '0';
		};
		o.onchange = function(ev, section_id, value) {
			if (value !== '1') {
				// Disable wallpaper - clear background
				callGlassRemove().then(function() {
					var bgWrap = document.getElementById('bg-wrap');
					if (bgWrap) {
						bgWrap.style.backgroundImage = 'none';
						bgWrap.innerHTML = '';
					}
					ui.addNotification(null, E('p', {}, _('Wallpaper disabled')), 'info');
				});
			}
			return true;
		};

		// Background Blur Control
		o = s.option(form.Value, 'bg_blur', _('Background blur (px)'),
		_('Blur effect on background wallpaper (0 = no blur, 50 = maximum blur).'));
		o.default = '0';
		o.placeholder = '0';
		o.datatype = 'range(0,50)';
		o.cfgvalue = function(section_id) {
			var value = uci.get('glass', section_id, 'bg_blur');
			return value || '0';
		};
		o.onchange = function(ev, section_id, value) {
			var bgWrap = document.getElementById('bg-wrap');
			if (bgWrap) {
				bgWrap.style.filter = value > 0 ? 'blur(' + value + 'px)' : 'none';
			}
			return true;
		};

		// Wallpaper Source Selection
		o = s.option(form.ListValue, 'bg_source', _('Wallpaper source'),
			_('Select online wallpaper source. Each source provides different styles of wallpapers.'));
		o.value('picsum', _('Picsum (Random photos)'));
		o.value('bing', _('Bing Daily'));
		o.value('iciba', _('Iciba Daily (China)'));
		o.default = 'picsum';
		o.cfgvalue = function(section_id) {
			var value = uci.get('glass', section_id, 'bg_source');
			return value || 'picsum';
		};
		o.onchange = function(ev, section_id, value) {
			// Update wallpaper source and regenerate batch
			callGlassSetSource(value).then(function(result) {
				if (result && result.success) {
					ui.addNotification(null, E('p', {}, _('Source updated, refreshing wallpapers...')), 'success');
					// Reload page to get new wallpapers
					setTimeout(function() {
						window.location.reload();
					}, 1000);
				}
			});
			return true;
		};

		// Wallpaper Count Setting
		o = s.option(form.Value, 'bg_count', _('Wallpaper count'),
			_('Number of wallpapers to display (4-16, default: 8). Changes take effect after refreshing the page.'));
		o.datatype = 'range(4,16)';
		o.default = '8';
		o.cfgvalue = function(section_id) {
			var value = uci.get('glass', section_id, 'bg_count');
			return value || '8';
		};

		// Online Wallpaper Gallery
		o = s.option(form.DummyValue, '_bg_gallery', _('Online Wallpaper Gallery'));
		o.rawhtml = true;
		o.cfgvalue = function () {
			// Apply current blur setting to background
			var blur = uci.get('glass', 'global', 'bg_blur') || '0';
			setTimeout(function() {
				var bgWrap = document.getElementById('bg-wrap');
				if (bgWrap && blur > 0) {
					bgWrap.style.filter = 'blur(' + blur + 'px)';
				}
			}, 100);
			return self.renderGallery();
		};

		// Add global event delegation for gallery interactions
		// Use a flag to ensure we only bind once
		if (!window.glassEventsBound) {
			window.glassEventsBound = true;
			document.addEventListener('click', function(ev) {
				var target = ev.target;
				while (target && target !== document.body) {
					if (target.matches('[data-action="remove-bg"]')) {
						ev.preventDefault();
						self.handleRemoveBg();
						return;
					}
					if (target.matches('[data-wallpaper-id]')) {
						ev.preventDefault();
						var id = target.getAttribute('data-wallpaper-id');
						self.handleDownload(id);
						return;
					}
					if (target.matches('[data-category]')) {
						ev.preventDefault();
						var cat = target.getAttribute('data-category');
						self.filterGallery(cat);
						return;
					}
				if (target.matches('[data-action="next-batch"]')) {
					ev.preventDefault();
					self.handleNextBatch();
					return;
				}
				if (target.matches('[data-action="download-custom"]')) {
					ev.preventDefault();
					self.handleCustomDownload(target);
					return;
				}
				target = target.parentElement;
				}
			});
		}

		return m.render();
	},

	renderGallery: function() {
		var self = this;
		// Debug: log data loading status
		var html = '<div data-bg-gallery="true">';

		// Source info and Next Batch button
		html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">';
		html += '<div style="font-size:0.9rem;color:var(--color-text-secondary);">';
		html += _('Source') + ': <strong>' + self.currentSource + '</strong>';
		if (self.currentBatch) {
			html += ' | ' + _('Batch') + ': ' + self.currentBatch.substring(0, 6) + '...';
		}
		html += '</div>';
		html += '<button class="cbi-button cbi-button-apply" data-action="next-batch">' + _('Next Batch') + '</button>';
		html += '</div>';

		// Category filter
		html += '<div style="display:flex;gap:0.5rem;margin-bottom:1rem;flex-wrap:wrap;">';
		html += '<button class="cbi-button ' + (self.selectedCategory === 'all' ? 'cbi-button-active' : '') + '" data-category="all">' + _('All') + '</button>';
		self.categories.forEach(function(cat) {
			// Skip the 'all' category as it's already rendered above
			if (cat.id !== 'all') {
				html += '<button class="cbi-button ' + (self.selectedCategory === cat.id ? 'cbi-button-active' : '') + '" data-category="' + cat.id + '">' + _(cat.name) + '</button>';
			}
		});
		html += '</div>';

		// Gallery grid
		html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;">';

		var filtered = self.selectedCategory === 'all'
			? self.wallpapers
			: self.wallpapers.filter(function(w) { return w.category === self.selectedCategory; });

		if (filtered.length === 0) {
			html += '<div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--color-text-secondary);">';
			html += _('No wallpapers available in this category');
			html += '</div>';
		} else {
			filtered.forEach(function(wp) {
				var isActive = self.currentBg && self.currentBg.name.indexOf(wp.id) >= 0;
				html += '<div style="position:relative;border-radius:12px;overflow:hidden;background:var(--color-bg-secondary);cursor:pointer;transition:transform 0.2s,box-shadow 0.2s;"';
				html += ' onmouseover="this.style.transform=\'scale(1.02)\';this.style.boxShadow=\'0 8px 25px rgba(0,0,0,0.15)\'"';
				html += ' onmouseout="this.style.transform=\'scale(1)\';this.style.boxShadow=\'none\'"';
				html += ' data-wallpaper-id="' + wp.id + '"';
				html += ' data-wallpaper-url="' + wp.url + '">';

				// Thumbnail
				html += '<div style="aspect-ratio:16/9;overflow:hidden;">';
				html += '<img src="' + wp.thumb + '" style="width:100%;height:100%;object-fit:cover;" loading="lazy" />';
				html += '</div>';

				// Info overlay
				html += '<div style="position:absolute;bottom:0;left:0;right:0;padding:0.75rem;background:linear-gradient(transparent,rgba(0,0,0,0.7));color:white;">';
				html += '<div style="font-weight:500;font-size:0.9rem;">' + _(wp.name) + '</div>';
				html += '<div style="font-size:0.75rem;opacity:0.8;">' + _(wp.category.charAt(0).toUpperCase() + wp.category.slice(1)) + '</div>';
				html += '</div>';

				// Active indicator
				if (isActive) {
					html += '<div style="position:absolute;top:0.5rem;right:0.5rem;background:var(--color-success);color:white;padding:0.25rem 0.5rem;border-radius:6px;font-size:0.75rem;font-weight:500;">';
					html += _('Active');
					html += '</div>';
				}

				// Apply button (visible on hover via CSS)
				html += '<div class="gallery-apply-btn" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);opacity:0;transition:opacity 0.2s;">';
				html += '<button class="cbi-button cbi-button-apply" style="white-space:nowrap;">' + (isActive ? _('Re-apply') : _('Apply')) + '</button>';
				html += '</div>';

				html += '</div>';
			});
		}

		html += '</div>';

		// Custom URL input
		html += '<div style="margin-top:1.5rem;padding:1rem;background:var(--color-bg-secondary);border-radius:12px;">';
		html += '<div style="font-weight:500;margin-bottom:0.5rem;">' + _('Custom URL') + '</div>';
		html += '<div style="display:flex;gap:0.5rem;">';
		html += '<input type="text" id="custom-wallpaper-url" placeholder="https://example.com/wallpaper.jpg" style="flex:1;padding:0.5rem;border-radius:6px;border:1px solid var(--color-border);background:var(--color-bg);color:var(--color-text);" />';
		html += '<button class="cbi-button cbi-button-apply" data-action="download-custom">' + _('Download & Apply') + '</button>';
		html += '</div>';
		html += '<div style="font-size:0.8rem;color:var(--color-text-secondary);margin-top:0.5rem;">';
		html += _('Enter a direct image URL to download and apply as background');
		html += '</div>';
		html += '</div>';

		// Custom URL button is handled by the delegated click listener in
		// render(): <script> tags inserted through innerHTML never execute

		// Add hover styles
		html += '<style>';
		html += '[data-bg-gallery] > div[style*="grid-template-columns"] > div:hover .gallery-apply-btn { opacity: 1 !important; }';
		html += '.cbi-button-active { background: var(--color-primary) !important; color: white !important; }';
		html += '</style>';

		html += '</div>';
		return html;
	},

	filterGallery: function(category) {
		this.selectedCategory = category;
		// Re-render by refreshing the section
		var galleryEl = document.querySelector('[data-bg-gallery]');
		if (galleryEl) {
			var parent = galleryEl.parentElement;
			parent.innerHTML = this.renderGallery();
		}
	},

	refreshBgInfo: function() {
		// Find the background info dummy value element and update it
		var self = this;
		var bgInfoWrappers = document.querySelectorAll('.cbi-value');
		bgInfoWrappers.forEach(function(wrapper) {
			var label = wrapper.querySelector('.cbi-value-title');
			// Check for background section by looking for keywords in title
			var titleText = label.textContent.trim();
			if (titleText.indexOf(_('Background')) >= 0 || titleText.indexOf('当前背景') >= 0 || titleText.indexOf('Current Background') >= 0) {
				var field = wrapper.querySelector('.cbi-value-field');
				if (field) {
					// Re-render the background info HTML
					var html = '';
					if (self.currentBg) {
						html += '<div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;">';
						html += '<div style="width:120px;height:80px;border-radius:8px;overflow:hidden;background:var(--color-bg-secondary);">';
						html += '<img src="' + self.currentBg.path + '?t=' + new Date().getTime() + '" style="width:100%;height:100%;object-fit:cover;" />';
						html += '</div>';
						html += '<div>';
						html += '<div style="font-weight:500;">' + _('Active') + ': ' + self.currentBg.name + '</div>';
						html += '<button class="cbi-button cbi-button-remove" style="margin-top:0.5rem;" data-action="remove-bg">' + _('Remove Background') + '</button>';
						html += '</div>';
						html += '</div>';
					} else {
						html += '<div style="padding:1rem;background:var(--color-bg-secondary);border-radius:8px;text-align:center;color:var(--color-text-secondary);">';
						html += '<div style="font-size:2rem;margin-bottom:0.5rem;">🖼️</div>';
						html += '<div>' + _('No background set. Upload a custom image or select from the gallery below.') + '</div>';
						html += '</div>';
					}
					field.innerHTML = html;
				}
			}
		});
	},

	handleDownload: function(id) {
		var self = this;

		// Check if wallpaper is enabled
		if (!self.bgEnabled) {
			ui.showModal(_('Wallpaper Disabled'), [
				E('p', {}, _('Please enable wallpaper feature first.')),
				E('div', { 'class': 'right' }, [
					E('button', {
						'class': 'cbi-button cbi-button-primary',
						'click': function() { ui.hideModal(); }
					}, _('OK'))
				])
			]);
			return;
		}

		var btn = document.querySelector('[data-wallpaper-id="' + id + '"] .cbi-button');
		var originalText = btn ? btn.textContent : '';

		// Get the direct URL from the wallpaper element
		var wpEl = document.querySelector('[data-wallpaper-id="' + id + '"]');
		var directUrl = wpEl ? wpEl.getAttribute('data-wallpaper-url') : null;

		if (btn) {
			btn.disabled = true;
			btn.textContent = _('Downloading...');
		}

		callGlassDownload(id, null, directUrl).then(function(result) {
			// Support both boolean and object return formats
			var success = (result === true) || (result && result.success === true);
			if (success) {
				ui.addNotification(null, E('p', {}, _('Wallpaper applied successfully')), 'success');
				// Update current background info
				var filename = (result && result.filename) ? result.filename : 'bg.jpg';
				self.currentBg = { name: filename, type: 'image', path: '/luci-static/glass/background/' + filename };
				// Update background image immediately without page refresh
				var bgWrap = document.getElementById('bg-wrap');
				if (bgWrap) {
					var timestamp = new Date().getTime();
					var newSrc = '/luci-static/glass/background/' + filename + '?t=' + timestamp;
					var existingImg = bgWrap.querySelector('img');
					var existingVideo = bgWrap.querySelector('video');
					if (existingImg) {
						existingImg.src = newSrc;
					} else if (existingVideo) {
						// Remove video and add image
						existingVideo.remove();
						var newImg = document.createElement('img');
						newImg.src = newSrc;
						newImg.alt = '';
						newImg.style.width = '100%';
						newImg.style.height = '100%';
						newImg.style.objectFit = 'cover';
						bgWrap.appendChild(newImg);
					} else {
						// No background exists yet
						var newImg = document.createElement('img');
						newImg.src = newSrc;
						newImg.alt = '';
						newImg.style.width = '100%';
						newImg.style.height = '100%';
						newImg.style.objectFit = 'cover';
						bgWrap.appendChild(newImg);
					}
				} else {
					console.error('Glass: bg-wrap element not found!');
				}
				// Re-render gallery to show active state
				var galleryEl = document.querySelector('[data-bg-gallery]');
				if (galleryEl) {
					var parent = galleryEl.parentElement;
					parent.innerHTML = self.renderGallery();
				}
				// Refresh current background info display
				self.refreshBgInfo();
			} else {
				ui.addNotification(null, E('p', {}, (result && result.error) || _('Failed to download wallpaper')), 'error');
			}
			if (btn) {
				btn.disabled = false;
				btn.textContent = originalText;
			}
		}).catch(function(err) {
			console.error('Glass: download error =', err);
			ui.addNotification(null, E('p', {}, _('Download failed: ') + (err.message || err)), 'error');
			if (btn) {
				btn.disabled = false;
				btn.textContent = originalText;
			}
		});
	},

	handleCustomDownload: function(btn) {
		var input = document.getElementById('custom-wallpaper-url');
		var url = input ? input.value.trim() : '';

		if (!this.bgEnabled) {
			ui.addNotification(null, E('p', {}, _('Please enable wallpaper feature first.')), 'warning');
			return;
		}
		if (!/^https?:\/\//i.test(url)) {
			ui.addNotification(null, E('p', {}, _('Enter a direct image URL to download and apply as background')), 'warning');
			return;
		}

		btn.disabled = true;
		btn.textContent = _('Downloading...');

		callGlassDownload(null, url, null).then(function(result) {
			if (result && result.success === true) {
				ui.addNotification(null, E('p', {}, _('Wallpaper applied successfully')), 'success');
				setTimeout(function() { window.location.reload(); }, 1000);
				return;
			}
			ui.addNotification(null, E('p', {}, (result && result.error) || _('Failed to download wallpaper')), 'error');
			btn.disabled = false;
			btn.textContent = _('Download & Apply');
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Download failed: ') + (err.message || err)), 'error');
			btn.disabled = false;
			btn.textContent = _('Download & Apply');
		});
	},

	handleNextBatch: function() {
		var self = this;

		var btn = document.querySelector('[data-action="next-batch"]');
		if (btn) {
			btn.disabled = true;
			btn.textContent = _('Loading...');
		}

		callGlassNextBatch().then(function(result) {
			if (result && result.success) {
				ui.addNotification(null, E('p', {}, _('New batch loaded, refreshing...')), 'success');
				// Reload page to get new wallpapers
				setTimeout(function() {
					window.location.reload();
				}, 500);
			} else {
				ui.addNotification(null, E('p', {}, _('Failed to load new batch')), 'error');
				if (btn) {
					btn.disabled = false;
					btn.textContent = _('Next Batch');
				}
			}
		}).catch(function(err) {
			console.error('Glass: next batch error =', err);
			ui.addNotification(null, E('p', {}, _('Failed to load new batch')), 'error');
			if (btn) {
				btn.disabled = false;
				btn.textContent = _('Next Batch');
			}
		});
	},

	handleRemoveBg: function() {
		var self = this;
		if (!confirm(_('Remove current background and return to default theme?'))) {
			return;
		}

		callGlassRemove().then(function(result) {
			// Support both boolean and object return formats
			var success = (result === true) || (result && result.success === true);
			if (success) {
				ui.addNotification(null, E('p', {}, _('Background removed successfully')), 'success');
				self.currentBg = null;
				// Immediately remove background image/video from DOM
				var bgWrap = document.getElementById('bg-wrap');
				if (bgWrap) {
					bgWrap.innerHTML = '';
					bgWrap.style.filter = 'none';
				}
				// Re-render gallery to update active state
				var galleryEl = document.querySelector('[data-bg-gallery]');
				if (galleryEl) {
					var parent = galleryEl.parentElement;
					parent.innerHTML = self.renderGallery();
				}
				// Refresh current background info display
				self.refreshBgInfo();
			} else {
				ui.addNotification(null, E('p', {}, result.error || _('Failed to remove background')), 'error');
			}
		}).catch(function(err) {
			ui.addNotification(null, E('p', {}, _('Remove failed: ') + (err.message || err)), 'error');
		});
	}
});
