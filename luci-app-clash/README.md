<h2 align="center">
 <img src="https://cdn.jsdelivr.net/gh/Dreamacro/clash/docs/logo.png" alt="Clash" width="200">
  <br>Luci For Clash <br>

</h2>

  <p align="center">
	A rule based custom proxy for Openwrt based on <a href="https://github.com/Dreamacro/clash" target="_blank">Clash</a>.
  </p>
  <p align="center">
  <a target="_blank" href="https://github.com/frainzy1477/luci-app-clash/releases/tag/v1.7.3.3">
    <img src="https://img.shields.io/badge/luci%20for%20clash-v1.7.3.3-blue.svg"> 	  
  </a>
  <a href="https://github.com/frainzy1477/luci-app-clash/releases" target="_blank">
        <img src="https://img.shields.io/github/downloads/frainzy1477/luci-app-clash/total.svg?style=flat-square"/>
   </a>
  </p>

  
 ## Install
- Upload ipk file to tmp folder
- cd /tmp
- opkg update
- opkg install luci-app-clash_1.7.3.3_all.ipk  
- opkg install luci-app-clash_1.7.3.3_all.ipk --force-depends

 ## Uninstall
- opkg remove luci-app-clash 
- opkg remove luci-app-clash --force-remove

## Features
- Suport Subscription Config
- Support Config Upload
- Support Create Config
- GeoIP Database Update
- TProxy UDP
- IP Query
- DNS Forwarding
- Support Trojan
- Support SSR
- Support V2ray
- Ping Custom Proxy Servers
- Tun Support
- Access Control
- Support Provider,
- Game Rules 
- Auto Restore Config

## Dependency

- bash
- coreutils
- coreutils-nohup
- coreutils-base64
- ipset
- iptables
- luci
- luci-base
- wget
- libustream-openssl 
- libopenssl 
- curl
- jsonfilter
- ca-certificates
- iptables-mod-tproxy
- kmod-tun
## License

Luci For Clash - OpenWrt is released under the GPL v3.0 License - see detailed [LICENSE](https://github.com/frainzy1477/luci-app-clash/blob/master/LICENSE) .


