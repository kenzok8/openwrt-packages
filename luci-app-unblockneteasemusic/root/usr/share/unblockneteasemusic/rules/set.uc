{%

let o_local_bypass = "
	0.0.0.0/8
	10.0.0.0/8
	100.64.0.0/10
	127.0.0.0/8
	169.254.0.0/16
	172.16.0.0/12
	192.0.0.0/24
	192.0.2.0/24
	192.31.196.0/24
	192.52.193.0/24
	192.88.99.0/24
	192.168.0.0/16
	192.175.48.0/24
	198.18.0.0/15
	198.51.100.0/24
	203.0.113.0/24
	224.0.0.0/4
	240.0.0.0/4
";

let set_suffix = {
	"acl_neteasemusic_http": {
		str: o_acl_http_addr,
	},
	"acl_neteasemusic_https": {
		str: o_acl_https_addr,
	},
	"local_addr": {
		str: o_local_bypass,
	},
	"neteasemusic": {
		str: o_neteasemusic_addr,
	},
};

function set_elements_parse(res, str) {
	for (let addr in split(str, /[ \t\n]/)) {
		addr = trim(addr);
		if (!addr) continue;
		push(res, addr);
	}
}

function set_elements(suf) {
	let obj = set_suffix[suf];
	let res = [];
	let addr;

	let str = obj["str"];
	if (str) {
		set_elements_parse(res, str);
	}

	return res;
}
%}

{% for (let suf in set_suffix): %}
set {{ suf }} {
	type ipv4_addr;
	flags interval;
{%   let elems = set_elements(suf); if (length(elems)): %}
	elements = {
{%     for (let i = 0; i < length(elems); i++): %}
		{{ elems[i] }}{% if (i < length(elems) - 1): %},{% endif %}{% print("\n") %}
{%     endfor %}
	}
{%   endif %}
}
{% endfor %}
