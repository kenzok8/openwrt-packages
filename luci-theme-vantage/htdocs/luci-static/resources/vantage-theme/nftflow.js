'use strict';
'require baseclass';
'require fs';
'require vantage-theme.nftmodel as nftmodel';

/*
 * Vantage theme - Status -> Firewall as a flow chart.
 *
 * LuCI's view lists every chain as a table of rules. On top of it this
 * draws (a Flow / Rules table switch picks one):
 *  - one chart of the way a packet goes: in through prerouting, then
 *    either input, this device and output, or forward, and out through
 *    postrouting; each stage names its chains and says whether it drops
 *    unmatched packets; ingress, bridge and egress hooks sit where a packet
 *    meets them; a second row for frames bridged between ports;
 *  - every base chain as a list of steps: the rule's name (fw4's comment),
 *    its conditions and what it does; a jump opens the chain it jumps to
 *    in place, so a packet's whole way reads top to bottom.
 * The ruleset comes from the command LuCI's page runs (same ACL). The
 * conditions are LuCI's own rendering of each rule, copied as text and a
 * few formatting tags; LuCI read the ruleset separately, so a chain whose
 * rows don't match its rules (a reload in between) shows no conditions.
 * Rules as in menu-vantage.js: E() with array content only, LuCI's nodes
 * stay where they are (hidden by a class in Flow mode).
 * ------------------------------------------------------------------------ */

const MODE_KEY = 'vantage.nft.mode';
const MAX_DEPTH = 8;
const MAX_STEPS = 200;     /* rules drawn per chain before "Show all" */

function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function reducedMotion() { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }

function hookName(h) {
	switch (h) {
	case 'prerouting': return _('Prerouting', 'vantage-theme');
	case 'input': return _('Input', 'vantage-theme');
	case 'forward': return _('Forward', 'vantage-theme');
	case 'output': return _('Output', 'vantage-theme');
	case 'postrouting': return _('Postrouting', 'vantage-theme');
	case 'ingress': return _('Ingress');
	case 'egress': return _('Egress');
	default: return h;
	}
}

function stageName(s) {
	switch (s.hook) {
	case 'bridgeIn': case 'bridgeOut': return _('Bridge');
	case 'bridged': return _('Bridged between ports', 'vantage-theme');
	default: return hookName(s.hook);
	}
}

function familyName(f) {
	return f === 'ip' ? 'IPv4' : f === 'ip6' ? 'IPv6' : f === 'inet' ? 'IPv4/IPv6' : f;
}

/* LuCI's table headings, so they read as in the Rules table */
function tableTitle(t) {
	switch (t.family) {
	case 'ip': return _('IPv4 traffic table "%h"').format(t.name);
	case 'ip6': return _('IPv6 traffic table "%h"').format(t.name);
	case 'inet': return _('IPv4/IPv6 traffic table "%h"').format(t.name);
	case 'arp': return _('ARP traffic table "%h"').format(t.name);
	case 'bridge': return _('Bridge traffic table "%h"').format(t.name);
	case 'netdev': return _('Network device table "%h"').format(t.name);
	default: return _('"%h" table "%h"', 'Yet unknown nftables table family ("family" table "name")').format(t.family, t.name);
	}
}

/* LuCI's rows per chain key, in the ruleset's order: tables, chains and
   rules are rendered in JSON order, one row per rule. A chain's rows are
   used only when they agree with its rules: same count, same comments,
   same jump targets (LuCI read the ruleset on its own; a reload between
   the two reads must not pair a rule with another rule's conditions). */
function luciRows(root, m) {
	const out = Object.create(null);
	const tables = root.querySelectorAll(':scope > .nft-table');
	m.tables.forEach((t, i) => {
		const box = tables[i];
		if (!box) return;
		const cards = box.querySelectorAll('.nft-chain');
		t.chains.forEach((k, j) => {
			const c = m.chains[k], card = cards[j], h = card && card.querySelector(':scope > h4');
			if (!h || h.id !== t.name + '.' + c.name) return;
			const rows = Array.prototype.filter.call(card.querySelectorAll('.nft-rules .tr'), (tr) => !tr.classList.contains('table-titles'));
			if (rows.length === c.rules.length && c.rules.every((r, n) => agrees(r, rows[n])))
				out[k] = rows;
		});
	});
	return out;
}

function agrees(r, tr) {
	const tip = tr.querySelector('.nft-comment .cbi-tooltip');
	if (!!tip !== !!r.comment || (tip && tip.textContent.indexOf(r.comment) < 0)) return false;
	const v = r.verdict, want = v.target ? [ v.target ] : (v.map || []).filter((e) => e.target).map((e) => e.target);
	const have = Array.prototype.map.call(tr.querySelectorAll('a[href^="#"]'), (a) => a.getAttribute('href').replace(/^#[^.]*\./, ''));
	return want.every((t) => have.indexOf(t) >= 0);
}

/* a copy of LuCI's rendering as text and its formatting tags only: no
   attribute but class (LuCI's tooltips take data-tooltip as markup, so it
   stays behind), nothing that loads or runs */
function copyOf(node) {
	if (node.nodeType === 3) return document.createTextNode(node.data);
	if (node.nodeType !== 1) return null;
	const kids = [];
	node.childNodes.forEach((n) => { const c = copyOf(n); if (c) kids.push(c); });
	const cls = node.getAttribute('class') || '';
	switch (node.tagName) {
	case 'VAR': return E('var', { 'class': cls }, kids);
	case 'STRONG': return E('strong', { 'class': cls }, kids);
	case 'EM': return E('em', { 'class': cls }, kids);
	case 'B': return E('b', { 'class': cls }, kids);
	case 'I': return E('i', { 'class': cls }, kids);
	case 'SMALL': return E('small', { 'class': cls }, kids);
	case 'DIV': return E('div', { 'class': cls }, kids);
	case 'BR': return E('br', { 'class': cls }, []);
	default: return E('span', { 'class': cls }, kids);
	}
}

/* a rule's conditions as LuCI shows them, without its comment and counter;
   vmap: the verdict chips say it all where LuCI can only show a placeholder
   (LuCI 24.10: "{ vmap }", its fallback for an expression it can't read) */
function conditions(tr, vmap) {
	const td = tr && tr.firstElementChild;
	if (!td) return null;
	const keep = Array.prototype.filter.call(td.childNodes, (n) => !(n.nodeType === 1 && n.matches('.nft-comment, .nft-counter'))
		&& !(vmap && n.nodeType === 1 && n.matches('.ifacebadge[data-tooltip]') && /^\{\s*vmap\s*\}$/.test(n.textContent.trim())));
	const c = E('div', { 'class': 'v-nft-cond' }, keep.map(copyOf).filter(Boolean));
	return c.textContent.trim() ? c : null;
}

/* the actions LuCI shows besides the deciding one (log, a helper, a mark);
   for NAT the deciding one too: it holds the address and port */
function sideActions(tr, parts, nat) {
	const td = tr && tr.children[1];
	if (!td || td.children.length !== parts.acts) return null;
	const keep = Array.prototype.filter.call(td.children, (n, i) => nat || i !== parts.last).map(copyOf).filter(Boolean);
	return keep.length ? E('div', { 'class': 'v-nft-cond v-nft-also' }, keep) : null;
}

function chip(kind, label, title) {
	const el = E('span', { 'class': 'v-nft-verdict', 'data-kind': kind }, [ label ]);
	if (title) el.setAttribute('title', title);
	return el;
}

function verdictLabel(v) {
	switch (v.kind) {
	case 'accept': return _('Accept', 'vantage-theme');
	case 'drop': return _('Drop', 'vantage-theme');
	case 'reject': return _('Reject', 'vantage-theme');
	case 'queue': return _('Queue to a program', 'vantage-theme');
	case 'nat':
		return v.nat === 'masquerade' ? _('Masquerade', 'vantage-theme') : v.nat === 'snat' ? _('Rewrite source', 'vantage-theme')
			: v.nat === 'dnat' ? _('Rewrite destination', 'vantage-theme') : _('Redirect', 'vantage-theme');
	default: return _('Next rule', 'vantage-theme');
	}
}

/* a chain with something to show: rules, or a policy that drops */
function live(c) { return c.rules.length > 0 || (c.base && c.policy === 'drop'); }

return baseclass.extend({
	attach(view) {
		const ready = () => {
			const t = view.querySelector('.nft-table');
			return t && t.parentNode;
		};
		const go = (root) => {
			L.resolveDefault(fs.exec_direct('/usr/sbin/nft', [ '--terse', '--json', 'list', 'ruleset' ], 'json'), null).then((json) => {
				if (!json || root.querySelector(':scope > .v-nft')) return;
				const m = nftmodel.build(json);
				if (!m.bases.length && !m.others.length) return;
				this.draw(root, m);
			}).catch((e) => { if (window.console) console.warn('vantage: firewall flow', e); });
		};
		const root = ready();
		if (root) return go(root);
		/* wait for LuCI's tables; give up once the view shows something
		   else ("No nftables ruleset loaded.") or after a minute */
		const done = () => { mo.disconnect(); window.clearTimeout(timer); };
		const mo = new MutationObserver(() => {
			const r = ready();
			if (r) { done(); go(r); }
			else if (!view.querySelector('.spinning') && view.textContent.trim()) done();
		});
		const timer = window.setTimeout(done, 60000);
		mo.observe(view, { childList: true, subtree: true });
	},

	draw(root, m) {
		this.m = m;
		this.rows = luciRows(root, m);
		this.ids = Object.create(null);
		Object.keys(m.chains).forEach((k, i) => { this.ids[k] = 'v-nft-c' + i; });
		this.cards = Object.create(null);

		const tabs = E('ul', { 'class': 'cbi-tabmenu v-nft-tabs', 'role': 'group', 'aria-label': _('View', 'vantage-theme') });
		const panel = E('div', { 'class': 'v-nft-panel' }, [
			E('h3', {}, [ _('Packet path', 'vantage-theme') ]),
			this.chart(),
			E('h3', {}, [ _('Chains', 'vantage-theme') ]),
			E('div', { 'class': 'v-nft-chains' }, this.cardsOf(m.bases))
		]);
		m.others.forEach((t) => {
			panel.appendChild(E('h3', {}, [ tableTitle(t) ]));
			panel.appendChild(E('div', { 'class': 'v-nft-chains' }, this.cardsOf(t.chains)));
		});
		if (m.unused.length) {
			panel.appendChild(E('h3', {}, [ m.namedMaps ? _('Chains no rule jumps to directly', 'vantage-theme') : _('Chains no rule jumps to', 'vantage-theme') ]));
			panel.appendChild(E('div', { 'class': 'v-nft-chains' }, this.cardsOf(m.unused, true)));
		}

		const box = E('div', { 'class': 'v-nft' }, [ tabs, panel ]);
		const set = (mode) => {
			root.classList.toggle('v-nft-flowmode', mode === 'flow');
			Array.prototype.forEach.call(tabs.children, (li) => {
				const on = li.getAttribute('data-mode') === mode;
				li.className = on ? 'cbi-tab' : 'cbi-tab-disabled';
				li.firstElementChild.setAttribute('aria-pressed', String(on));
			});
			if (mode === 'flow') this.fit();
		};
		/* LuCI's tab markup for the look; buttons for what they do */
		[ [ 'flow', _('Flow', 'vantage-theme') ], [ 'table', _('Rules table', 'vantage-theme') ] ].forEach((t) => {
			const pick = (ev) => { ev.preventDefault(); storageSet(MODE_KEY, t[0]); set(t[0]); };
			tabs.appendChild(E('li', { 'data-mode': t[0], 'role': 'presentation' }, [
				E('a', { 'href': '#', 'role': 'button', 'click': pick,
					'keydown': (ev) => { if (ev.key === ' ' || ev.key === 'Spacebar') pick(ev); } }, [ t[1] ])
			]));
		});
		root.insertBefore(box, root.firstChild);
		set(storageGet(MODE_KEY) === 'table' ? 'table' : 'flow');
		if (window.ResizeObserver) new ResizeObserver(() => this.fit()).observe(this.el);
	},

	/* the way through the hooks: in, a fork (to this device and back out,
	   or forwarded), out; below it the way of frames bridged between ports */
	chart() {
		const st = this.m.stages;
		const arrow = () => E('span', { 'class': 'v-nft-arrow', 'aria-hidden': 'true' });
		const pass = () => E('span', { 'class': 'v-nft-pass', 'aria-hidden': 'true' });
		const end = (where) => E('span', { 'class': 'v-nft-endpoint', 'data-where': where }, [ where === 'device' ? _('This device', 'vantage-theme') : _('Network') ]);
		const row = [ end('net') ];
		[ st.ingress, st.bridgeIn, st.prerouting ].filter(Boolean).forEach((s) => { row.push(arrow(), this.stage(s)); });
		row.push(arrow(), E('div', { 'class': 'v-nft-fork' }, [
			E('div', { 'class': 'v-nft-branch' }, [ this.stage(st.input), arrow(), end('device'), arrow(), this.stage(st.output), pass() ]),
			E('div', { 'class': 'v-nft-branch' }, [ this.stage(st.forward), pass() ])
		]), arrow(), this.stage(st.postrouting));
		[ st.bridgeOut, st.egress ].filter(Boolean).forEach((s) => { row.push(arrow(), this.stage(s)); });
		row.push(arrow(), end('net'));

		const bridged = [ end('net') ];
		[ st.ingress, st.bridged, st.egress ].filter(Boolean).forEach((s) => { bridged.push(arrow(), this.stage(s)); });
		bridged.push(pass(), arrow(), end('net'));

		const notes = [];
		if (!st.bridged.chains.length)
			notes.push(E('p', { 'class': 'v-nft-note' }, [ _('Frames bridged between ports of one bridge, such as Wi-Fi and LAN in br-lan on an access point, never reach the input, forward or output chains, and no bridge chain filters them here. (The kernel can hand them to the IP chains if br_netfilter is enabled; the ruleset doesn\'t show that.)', 'vantage-theme') ]));
		if (this.m.offload)
			notes.push(E('p', { 'class': 'v-nft-note' }, [ _('Flow offloading is on: once a forwarded connection is established, its packets can skip prerouting, forward and postrouting, so these chains and their counters see only its first packets.', 'vantage-theme') ]));

		this.el = E('div', { 'class': 'v-nft-chart' }, [
			E('div', { 'class': 'v-nft-chart-row' }, row),
			E('div', { 'class': 'v-nft-chart-row' }, bridged)
		].concat(notes));
		return this.el;
	},

	/* the chart runs across while it fits, else down (again only when
	   its width changed: switching changes the height alone) */
	fit() {
		const el = this.el;
		if (!el || !el.offsetWidth || el.offsetWidth === this.fitW) return;
		this.fitW = el.offsetWidth;
		el.classList.remove('v-nft-vertical');
		const wide = Array.prototype.some.call(el.querySelectorAll(':scope > .v-nft-chart-row'), (r) => r.scrollWidth > r.clientWidth + 1);
		el.classList.toggle('v-nft-vertical', wide);
	},

	/* a stage: its name, whether it drops, its chains with something to show */
	stage(s) {
		const m = this.m, list = s.chains.filter((k) => live(m.chains[k]));
		const none = s.hook === 'bridged' && !s.chains.length;
		const name = [ stageName(s) ];
		if (s.drops === 'all')
			name.push(E('small', {}, [ s.only ? _('drops unmatched %s', 'vantage-theme').format(familyName(s.only)) : _('drops unmatched', 'vantage-theme') ]));
		else if (s.drops === 'some')
			name.push(E('small', {}, [ _('rules drop some', 'vantage-theme') ]));
		else if (none)
			name.push(E('small', {}, [ _('no bridge chains', 'vantage-theme') ]));
		/* a name twice at one hook (docker, mwan3): say whose */
		const seen = Object.create(null);
		s.chains.forEach((k) => { seen[m.chains[k].name] = (seen[m.chains[k].name] || 0) + 1; });
		return E('div', { 'class': 'v-nft-stage', 'data-drops': none ? 'open' : s.drops, 'data-edge': String(nftmodel.HOOKS.indexOf(s.hook) < 0) }, [
			E('div', { 'class': 'v-nft-stage-name' }, name),
			E('div', { 'class': 'v-nft-stage-chains' }, list.length ? list.map((k) => {
				const c = m.chains[k];
				const b = E('button', { 'type': 'button', 'class': 'v-nft-link', 'click': () => this.show(k),
					'title': _('%s: table %s (%s), priority %d', 'vantage-theme').format(c.name, c.table, familyName(c.family), c.prio) }, [ c.name ]);
				if (seen[c.name] > 1 || (nftmodel.HOOKS.indexOf(s.hook) < 0 && c.family !== 'netdev' && c.family !== 'bridge'))
					b.appendChild(E('small', {}, [ c.table + ' · ' + familyName(c.family) ]));
				else if (c.type === 'nat')
					b.appendChild(E('small', {}, [ _('NAT') ]));
				return b;
			}) : none ? [] : [ E('span', { 'class': 'v-nft-none' }, [ _('no rules', 'vantage-theme') ]) ])
		]);
	},

	/* open a chain's card and bring it into view */
	show(k) {
		const card = this.cards[k];
		if (!card) return;
		card.open = true;
		card.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
		const s = card.querySelector('summary');
		if (s) s.focus({ preventScroll: true });
	},

	/* a card per chain with something to show; the empty ones on one line */
	cardsOf(keys, regular) {
		const c = (k) => this.m.chains[k];
		const out = keys.filter((k) => regular ? c(k).rules.length : live(c(k))).map((k) => this.card(k));
		const empty = keys.filter((k) => regular ? !c(k).rules.length : !live(c(k)));
		if (empty.length)
			out.push(E('p', { 'class': 'v-nft-empty' }, [ _('No rules: %s', 'vantage-theme').format(empty.map((k) => c(k).name).join(', ')) ]));
		return out;
	},

	card(k) {
		const m = this.m, c = m.chains[k];
		const meta = [];
		if (c.base) {
			meta.push(hookName(c.hook), _('priority %d', 'vantage-theme').format(c.prio));
			if (c.family !== 'inet') meta.push(familyName(c.family));
			if (c.type === 'nat') meta.push(_('NAT'));
			if (c.dev.length) meta.push(_('on %s', 'vantage-theme').format(c.dev.join(', ')));
		}
		meta.push(N_(c.rules.length, '%d rule', '%d rules', 'vantage-theme').format(c.rules.length));
		/* other chains at the same hook (and family group) still see what
		   this one accepts */
		if (c.base) {
			const group = (f) => f === 'bridge' ? 'bridge' : f === 'netdev' ? 'netdev' : 'ip';
			const more = Object.keys(m.chains).filter((o) => o !== k && m.chains[o].base && m.chains[o].hook === c.hook
				&& group(m.chains[o].family) === group(c.family) && live(m.chains[o])).length;
			if (more) meta.push(N_(more, '%d more chain at this hook', '%d more chains at this hook', 'vantage-theme').format(more));
		}
		const card = E('details', { 'class': 'v-nft-card', 'id': this.ids[k], 'data-chain': c.name, 'data-family': c.family }, [
			E('summary', {}, [ E('strong', {}, [ c.name ]), E('span', { 'class': 'v-nft-meta' }, [ meta.join(' · ') ]) ].concat(c.base ? [ this.policyChip(c) ] : []))
		]);
		/* the chains that drop what no rule accepts start open */
		card.open = c.base && c.policy === 'drop';
		let built = false;
		const fill = () => { if (!built && card.open) { built = true; card.appendChild(this.flow(k, [ k ], [])); } };
		card.addEventListener('toggle', fill);
		fill();
		this.cards[k] = card;
		return card;
	},

	policyChip(c) {
		if (c.policy === 'drop') return chip('drop', _('Drops unmatched', 'vantage-theme'));
		if (c.type === 'filter') return chip('accept', _('Passes unmatched', 'vantage-theme'));
		return chip('none', _('Leaves unmatched unchanged', 'vantage-theme'));
	},

	/* where a packet goes when it leaves the chain without a verdict:
	   back to the chain that last jumped (a goto doesn't come back), or,
	   with none, the base chain's policy */
	away(path, stack) {
		const up = stack.length ? this.m.chains[stack[stack.length - 1]] : null;
		if (up) return chip('return', _('Back to %s', 'vantage-theme').format(up.name));
		const b = this.m.chains[path[0]];
		if (!b.base) return chip('return', _('Back to the calling chain', 'vantage-theme'));
		if (b.policy === 'drop') return chip('drop', _('Drop: %s policy', 'vantage-theme').format(b.name));
		if (b.type === 'filter') return chip('accept', _('Pass: %s policy', 'vantage-theme').format(b.name));
		return chip('none', _('Unchanged', 'vantage-theme'));
	},

	/* a chain's rules as steps. path: the chains opened above it (to stop
	   at a loop); stack: the chains to come back to (a jump adds its
	   chain, a goto doesn't) */
	flow(k, path, stack) {
		const c = this.m.chains[k], rows = this.rows[k];
		const list = E('ol', { 'class': 'v-nft-flow' });
		const step = (r) => {
			const row = rows && rows[r.index];
			const cond = r.parts.conds && row ? conditions(row, r.verdict.kind === 'vmap') : null;
			const nat = r.verdict.kind === 'nat';
			const also = row && r.verdict.kind !== 'vmap' && (nat || r.parts.acts > (r.parts.last >= 0 ? 1 : 0)) ? sideActions(row, r.parts, nat) : null;
			/* a rule with conditions LuCI's rows can't supply never reads
			   as "Any packet" */
			const label = r.comment || (cond ? '' : r.parts.conds ? _('Conditions in the rules table', 'vantage-theme') : _('Any packet', 'nft match any traffic'));
			const what = [ E('div', { 'class': 'v-nft-what-name', 'data-muted': String(!r.comment && !cond && !!r.parts.conds) }, [ label ]) ];
			if (!r.comment && cond) what[0] = cond;
			else if (cond) what.push(cond);
			if (also) what.push(also);
			const then = this.outcome(r.verdict, c, path, stack);
			if (r.counter)
				then.push(E('span', { 'class': 'v-nft-count', 'title': _('Traffic matched by rule: %.1000mPackets, %.1024mBytes', 'nft counter').format(r.counter.packets, r.counter.bytes) },
					[ _('%s matched', 'vantage-theme').format('%.1024mB'.format(r.counter.bytes)) ]));
			return E('li', { 'class': 'v-nft-step' }, [
				E('span', { 'class': 'v-nft-n' }, [ String(r.index + 1) ]),
				E('div', { 'class': 'v-nft-what' }, what),
				E('div', { 'class': 'v-nft-then' }, then)
			]);
		};
		c.rules.slice(0, MAX_STEPS).forEach((r) => list.appendChild(step(r)));
		if (c.rules.length > MAX_STEPS) {
			const more = E('li', { 'class': 'v-nft-step v-nft-step-more' }, [
				E('span', { 'class': 'v-nft-n', 'aria-hidden': 'true' }),
				E('button', { 'type': 'button', 'class': 'v-nft-verdict v-nft-jump', 'click': () => {
					c.rules.slice(MAX_STEPS).forEach((r) => list.insertBefore(step(r), more));
					more.remove();
				} }, [ N_(c.rules.length - MAX_STEPS, 'Show %d more rule', 'Show %d more rules', 'vantage-theme').format(c.rules.length - MAX_STEPS) ])
			]);
			list.appendChild(more);
		}
		list.appendChild(this.end(path, stack));
		return list;
	},

	/* what a rule does: a verdict, or the chain it jumps to (opens below) */
	outcome(v, c, path, stack) {
		const jump = (kind, target, key) => {
			const tk = nftmodel.keyOf(c.family, c.table, target);
			const label = (key != null ? key + ' → ' : '→ ') + target;
			if (!this.m.chains[tk]) return chip(kind, label);
			if (path.indexOf(tk) >= 0) return chip(kind, label + ' ' + _('(open above)', 'vantage-theme'));
			if (path.length >= MAX_DEPTH) return chip(kind, label + ' ' + _('(too deep to open here)', 'vantage-theme'));
			const b = E('button', { 'type': 'button', 'class': 'v-nft-verdict v-nft-jump', 'data-kind': kind, 'aria-expanded': 'false',
				'title': kind === 'goto' ? _('Continues in %s and does not come back here', 'vantage-theme').format(target) : _('Continues in %s, then comes back here', 'vantage-theme').format(target) }, [ label ]);
			let sub = null;
			b.addEventListener('click', () => {
				if (!sub) {
					const back = kind === 'jump' ? stack.concat([ c.key ]) : stack;
					sub = E('div', { 'class': 'v-nft-sub' }, [ this.flow(tk, path.concat([ tk ]), back) ]);
					b.closest('.v-nft-step').appendChild(sub);
				}
				const open = b.getAttribute('aria-expanded') !== 'true';
				sub.hidden = !open;
				b.setAttribute('aria-expanded', String(open));
			});
			return b;
		};
		if (v.kind === 'return') return [ this.away(path, stack) ];
		if (v.kind === 'jump' || v.kind === 'goto') return [ jump(v.kind, v.target) ];
		if (v.kind === 'vmap' && v.named) return [ chip('none', _('Verdict map %s', 'vantage-theme').format(v.named)) ];
		if (v.kind === 'vmap') {
			/* keys with the same verdict share a chip: "established, related → Accept" */
			const out = [], same = Object.create(null);
			v.map.forEach((e) => {
				if (e.kind === 'jump' || e.kind === 'goto') return out.push(jump(e.kind, e.target, e.key));
				const kind = e.kind === 'return' ? 'return' : e.kind;
				if (same[kind]) return same[kind].push(e.key);
				same[kind] = [ e.key ];
				out.push(kind);
			});
			return out.map((x) => typeof x !== 'string' ? x
				: chip(x === 'return' ? 'return' : x, same[x].join(', ') + ' → ' + (x === 'return' ? this.away(path, stack).textContent : verdictLabel({ kind: x }))));
		}
		return [ chip(v.kind, verdictLabel(v)) ];
	},

	/* where a packet goes when no rule of the chain decided */
	end(path, stack) {
		return E('li', { 'class': 'v-nft-step v-nft-step-end' }, [
			E('span', { 'class': 'v-nft-n', 'aria-hidden': 'true' }),
			E('div', { 'class': 'v-nft-what' }, [ _('No rule matched', 'vantage-theme') ]),
			E('div', { 'class': 'v-nft-then' }, [ this.away(path, stack) ])
		]);
	}
});
