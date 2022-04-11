{%

let http_port = o_http_port;
let https_port = o_https_port;
let pub_access = o_pub_access;
let hijack_ways = o_hijack_ways;

%}

{% if (pub_access == 1): %}
chain input_wan {
	tcp dport {{ http_port }} counter accept comment "!fw4: unblockneteasemusic-http-pub-access"
	tcp dport {{ https_port }} counter accept comment "!fw4: unblockneteasemusic-https-pub-access"
}
{% endif %}

{% if (hijack_ways == "use_ipset"): %}
chain netease_cloud_music {
	type nat hook prerouting priority -1; policy accept;
	meta l4proto tcp ip daddr @neteasemusic jump netease_cloud_music_redir;
}

chain netease_cloud_music_redir {
	ip daddr @local_addr return;
	ip saddr @acl_neteasemusic_http accept;
	ip saddr @acl_neteasemusic_https accept;
	tcp dport 80 counter redirect to :{{ http_port }};
	tcp dport 443 counter redirect to :{{ https_port }};
}
{% endif %}
