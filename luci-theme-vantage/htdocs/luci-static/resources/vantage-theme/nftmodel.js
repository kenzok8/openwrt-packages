'use strict';
'require baseclass';

/*
 * Vantage theme - the live nftables ruleset as a model for the flow view
 * on Status -> Firewall (vantage-theme.nftflow draws it).
 *
 * Input: the JSON of `nft --terse --json list ruleset`, the command LuCI's
 * own page runs. Output: tables, chains with their rules and what each
 * rule finally does, and the stages a packet passes (the IP hooks, and
 * the ingress, bridge and egress hooks around them) with their base
 * chains in priority order. Pure functions, no DOM, unit tested in
 * tests/nftflow.test.js.
 */

/* the IP families share the hooks; other families get their own list */
const IP = { ip: true, ip6: true, inet: true };
const HOOKS = [ 'prerouting', 'input', 'forward', 'output', 'postrouting' ];
/* every hook in the order a packet can meet it, to sort other families */
const ORDER = [ 'ingress', 'prerouting', 'input', 'forward', 'output', 'postrouting', 'egress' ];
/* where a packet meets the other hooks: ingress first (netdev, and inet
   since Linux 5.10) and netdev egress last, on their device; bridge hooks
   on a bridge port, prerouting and input before the IP stack, output and
   postrouting after it; prerouting, forward and postrouting for frames
   bridged from port to port, which never reach the IP hooks (unless the
   kernel's br_netfilter hands them over, which the ruleset doesn't show) */
const EDGES = {
	ingress: [ [ 'netdev', 'inet', 'ip', 'ip6' ], [ 'ingress' ] ],
	bridgeIn: [ [ 'bridge' ], [ 'prerouting', 'input' ] ],
	bridgeOut: [ [ 'bridge' ], [ 'output', 'postrouting' ] ],
	egress: [ [ 'netdev' ], [ 'egress' ] ],
	bridged: [ [ 'bridge' ], [ 'prerouting', 'forward', 'postrouting' ] ]
};

/* statements that end the rule (the last one wins); everything else
   (counter, limit, log, mangle, ct helper, notrack, flow) lets the packet
   go on to the next rule */
const NAT = { masquerade: true, snat: true, dnat: true, redirect: true };

/* what LuCI's view counts as an action (its isActionExpression); it shows
   every other statement but a counter among the rule's conditions */
const ACTIONS = [ 'accept', 'notrack', 'reject', 'drop', 'jump', 'goto', 'continue', 'snat', 'dnat',
	'redirect', 'mangle', 'masquerade', 'return', 'flow', 'ct helper', 'log' ];
/* nft prints "flow add @ft" as a bare string */
const FLOW_ADD = /^flow add @\S+$/;

function own(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
function str(v) { return typeof v === 'string' ? v : ''; }
function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
function obj(v) { return v != null && typeof v === 'object'; }

function isAction(st) {
	if (typeof st === 'string') return FLOW_ADD.test(st);
	return obj(st) && ACTIONS.some((k) => own(st, k));
}

/* names can't hold a newline: no two chains share a key */
function keyOf(family, table, name) { return family + '\n' + table + '\n' + name; }

/* a verdict object ({ accept: null }, { jump: { target } }, ...) */
function verdict(v) {
	if (!obj(v)) return null;
	if (own(v, 'accept')) return { kind: 'accept' };
	if (own(v, 'drop')) return { kind: 'drop' };
	if (own(v, 'reject')) return { kind: 'reject' };
	if (own(v, 'return')) return { kind: 'return' };
	if (own(v, 'continue')) return { kind: 'continue' };
	if (own(v, 'queue')) return { kind: 'queue' };
	for (const k of [ 'jump', 'goto' ])
		if (own(v, k) && v[k] && str(v[k].target)) return { kind: k, target: v[k].target };
	return null;
}

/* a map key as text: strings and numbers; prefixes and ranges roughly */
function keyText(k) {
	if (typeof k === 'string' || typeof k === 'number') return String(k);
	if (obj(k)) {
		if (own(k, 'prefix') && k.prefix) return str(k.prefix.addr) + '/' + String(num(k.prefix.len) != null ? k.prefix.len : '');
		if (Array.isArray(k.range)) return k.range.map(keyText).join('-');
		if (Array.isArray(k.concat)) return k.concat.map(keyText).join(' . ');
	}
	return '…';
}

const DROPS = { drop: true, reject: true };

return baseclass.extend({
	HOOKS: HOOKS,

	keyOf: keyOf,

	/* fw4 marks its own comments with "!fw4: " */
	comment(c) { return str(c).replace(/^!fw4:\s*/, '').trim(); },

	/* what a rule's statements finally do:
	   { kind: accept|drop|reject|return|continue|queue|jump|goto|nat|vmap|none,
	     target (jump, goto), nat (its statement), map (vmap: [{ key, kind,
	     target }]), named (a vmap looked up in a named map: its name) } */
	ruleVerdict(expr) {
		let out = { kind: 'none' };
		(Array.isArray(expr) ? expr : []).forEach((st) => {
			if (!obj(st)) return;
			const v = verdict(st);
			if (v) { out = v; return; }
			for (const k in NAT) if (own(st, k)) { out = { kind: 'nat', nat: k }; return; }
			if (!own(st, 'vmap') || !st.vmap) return;
			const data = st.vmap.data;
			if (typeof data === 'string') { out = { kind: 'vmap', map: [], named: data.replace(/^@/, '') }; return; }
			const map = [];
			(data && Array.isArray(data.set) ? data.set : []).forEach((e) => {
				const d = Array.isArray(e) ? verdict(e[1]) : null;
				if (d) map.push({ key: keyText(e[0]), kind: d.kind, target: d.target });
			});
			out = { kind: 'vmap', map: map };
		});
		return out;
	},

	/* matched packets and bytes, when the rule counts */
	counter(expr) {
		const c = (Array.isArray(expr) ? expr : []).find((st) => obj(st) && own(st, 'counter') && st.counter);
		return c && num(c.counter.packets) != null ? { packets: c.counter.packets, bytes: num(c.counter.bytes) || 0 } : null;
	},

	/* how LuCI's view splits the statements: { conds, acts, last }; conds:
	   statements it shows as conditions (all but counters and actions, the
	   vmap's lookup included), acts: the actions in order, last: the index
	   among them of the one that decides (-1: none does) */
	parts(expr) {
		const out = { conds: 0, acts: 0, last: -1 };
		(Array.isArray(expr) ? expr : []).forEach((st) => {
			if (obj(st) && own(st, 'counter')) return;
			if (obj(st) && own(st, 'vmap')) { out.conds++; return; }
			if (!isAction(st)) { out.conds++; return; }
			if (verdict(st) || Object.keys(NAT).some((k) => own(st, k))) out.last = out.acts;
			out.acts++;
		});
		return out;
	},

	build(json) {
		const items = json && Array.isArray(json.nftables) ? json.nftables : [];
		const tables = [], chains = Object.create(null), byTable = Object.create(null);
		let offload = false;

		items.forEach((it) => {
			if (obj(it) && obj(it.flowtable)) offload = true;
			const t = it && it.table;
			if (!obj(t) || !str(t.family) || !str(t.name)) return;
			const tk = keyOf(t.family, t.name, '');
			if (byTable[tk]) return;
			byTable[tk] = { family: t.family, name: t.name, chains: [] };
			tables.push(byTable[tk]);
		});
		items.forEach((it) => {
			const c = it && it.chain;
			if (!obj(c) || !str(c.family) || !str(c.table) || !str(c.name)) return;
			const k = keyOf(c.family, c.table, c.name);
			if (chains[k]) return;
			const base = str(c.hook) !== '';
			const dev = Array.isArray(c.dev) ? c.dev.filter((d) => typeof d === 'string') : str(c.dev) ? [ c.dev ] : [];
			chains[k] = {
				key: k, family: c.family, table: c.table, name: c.name,
				type: str(c.type), hook: str(c.hook), prio: num(c.prio) || 0,
				policy: base ? (str(c.policy) || 'accept') : '', base: base, dev: dev,
				rules: [], callers: []
			};
			const tk = keyOf(c.family, c.table, '');
			if (!byTable[tk]) { byTable[tk] = { family: c.family, name: c.table, chains: [] }; tables.push(byTable[tk]); }
			byTable[tk].chains.push(k);
		});
		items.forEach((it) => {
			const r = it && it.rule;
			if (!obj(r) || !str(r.family) || !str(r.table) || !str(r.chain)) return;
			const c = chains[keyOf(r.family, r.table, r.chain)];
			if (!c) return;
			const expr = Array.isArray(r.expr) ? r.expr : [];
			if (expr.some((st) => (typeof st === 'string' && FLOW_ADD.test(st)) || (obj(st) && own(st, 'flow'))))
				offload = true;
			c.rules.push({
				index: c.rules.length,
				comment: this.comment(r.comment),
				verdict: this.ruleVerdict(expr),
				counter: this.counter(expr),
				parts: this.parts(expr)
			});
		});

		/* who jumps where: targets live in the caller's table */
		const targets = (c, r) => (r.verdict.target ? [ r.verdict.target ] : (r.verdict.map || []).map((e) => e.target))
			.map((t) => t && chains[keyOf(c.family, c.table, t)]).filter(Boolean);
		Object.keys(chains).forEach((k) => {
			const c = chains[k];
			c.rules.forEach((r) => {
				targets(c, r).forEach((to) => { if (to.callers.indexOf(k) < 0) to.callers.push(k); });
			});
		});

		/* whether a rule of the chain, or of a chain it jumps or goes to,
		   drops or rejects: fw4 keeps most of its filtering in zone chains */
		const memo = new Map();
		const mayDrop = (k, seen) => {
			if (memo.has(k)) return memo.get(k);
			if (seen.has(k)) return false;
			seen.add(k);
			const c = chains[k];
			const out = c.rules.some((r) => DROPS[r.verdict.kind] || (r.verdict.map || []).some((e) => DROPS[e.kind])
				|| targets(c, r).some((to) => mayDrop(to.key, seen)));
			memo.set(k, out);
			return out;
		};
		Object.keys(chains).forEach((k) => { chains[k].mayDrop = mayDrop(k, new Set()); });

		const byPrio = (a, b) => chains[a].prio - chains[b].prio || (chains[a].name < chains[b].name ? -1 : chains[a].name > chains[b].name ? 1 : 0);
		const byHook = (a, b) => ORDER.indexOf(chains[a].hook) - ORDER.indexOf(chains[b].hook) || byPrio(a, b);
		const of = (families, hooks) => Object.keys(chains).filter((k) => families.indexOf(chains[k].family) >= 0 && hooks.indexOf(chains[k].hook) >= 0).sort(byHook);
		const stage = (hook, list) => {
			/* unmatched packets: a filter chain that drops them stops them
			   here (for its family only); otherwise a rule may drop some */
			const droppers = list.filter((k) => chains[k].type === 'filter' && chains[k].policy === 'drop');
			const fams = droppers.map((k) => chains[k].family);
			return {
				hook: hook, chains: list,
				drops: droppers.length ? 'all' : list.some((k) => chains[k].mayDrop) ? 'some' : 'none',
				/* 'ip' or 'ip6' when only that family's chains drop unmatched */
				only: droppers.length && fams.indexOf('inet') < 0 && fams.every((f) => f === fams[0]) && fams[0] !== 'bridge' && fams[0] !== 'netdev' ? fams[0] : ''
			};
		};

		/* the IP hooks always; the others only where they have chains, but
		   for the bridged path, which the chart always shows: without a
		   bridge chain nothing in the ruleset filters it */
		const stages = {};
		HOOKS.forEach((h) => { stages[h] = stage(h, of([ 'ip', 'ip6', 'inet' ], [ h ])); });
		Object.keys(EDGES).forEach((id) => {
			const list = of(EDGES[id][0], EDGES[id][1]);
			stages[id] = list.length || id === 'bridged' ? stage(id, list) : null;
		});

		/* the IP base chains in the order a packet meets them */
		const bases = of([ 'ip', 'ip6', 'inet' ], ORDER);

		/* other families (bridge, netdev, arp): their tables' base chains */
		const others = tables.filter((t) => !IP[t.family])
			.map((t) => ({ family: t.family, name: t.name, chains: t.chains.filter((k) => chains[k].base).sort(byHook) }))
			.filter((t) => t.chains.length);

		/* regular chains no rule jumps to (a named verdict map may still:
		   its contents aren't in the terse ruleset) */
		const unused = Object.keys(chains).filter((k) => !chains[k].base && !chains[k].callers.length);
		const namedMaps = Object.keys(chains).some((k) => chains[k].rules.some((r) => r.verdict.named));

		return { tables: tables, chains: chains, stages: stages, bases: bases, others: others, unused: unused, namedMaps: namedMaps, offload: offload };
	}
});
