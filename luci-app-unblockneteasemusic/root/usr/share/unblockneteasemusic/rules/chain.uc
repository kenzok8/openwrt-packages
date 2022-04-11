{%

let http_port = o_http_port;
let https_port = o_https_port;

%}

chain netease_cloud_music {
	type nat hook prerouting priority -1;
	meta l4proto tcp ip daddr @neteasemusic_ipv4 jump netease_cloud_music_redir;
	meta l4proto tcp ip6 daddr @neteasemusic_ipv6 jump netease_cloud_music_redir;
}

chain netease_cloud_music_redir {
	ip daddr @local_addr_ipv4 return;
	ip saddr @acl_neteasemusic_http_ipv4 accept;
	ip saddr @acl_neteasemusic_https_ipv4 accept;
	ip6 daddr @local_addr_ipv6 return;
	ip6 saddr @acl_neteasemusic_http_ipv6 accept;
	ip6 saddr @acl_neteasemusic_https_ipv6 accept;
	tcp dport 80 counter redirect to :{{ http_port }};
	tcp dport 443 counter redirect to :{{ https_port }};
}


