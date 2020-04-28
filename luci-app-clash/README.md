<h2 align="center">
 <img src="https://cdn.jsdelivr.net/gh/Dreamacro/clash/docs/logo.png" alt="Clash" width="200">
  <br>Luci For Clash <br>

</h2>

  <p align="center">
	A rule based custom proxy for Openwrt based on <a href="https://github.com/Dreamacro/clash" target="_blank">Clash</a>.
  </p>
  <p align="center">
  <a target="_blank" href="https://github.com/frainzy1477/luci-app-clash/releases/tag/v1.6.8">
    <img src="https://img.shields.io/badge/luci%20for%20clash-v1.6.8-blue.svg"> 	  
  </a>
  <!-- <a href="https://github.com/frainzy1477/luci-app-clash/releases" target="_blank">
        <img src="https://img.shields.io/github/downloads/frainzy1477/luci-app-clash/total.svg?style=flat-square"/>
    </a>-->
  </p>

  
 ## Install
- Upload ipk file to tmp folder

- cd /tmp
- opkg update
- opkg install luci-app-clash_1.6.8_all.ipk  
- opkg install luci-app-clash_1.6.8_all.ipk --force-depends

## Features

- Support Manually config upload
- GeoIP Database Update
- Iptables udp redirect
- IP Query / Website Access Check
- DNS Forwarding
- Support Trojan
- Support SSR
- Ping Custom proxy servers
- Create v2ray & ssr clash config from subscription url
- Create Custom Clash Config
- Tun Support
- Support Proxy Provider,Game rules & Restore Config [Thanks to @vernesong ](https://github.com/vernesong/OpenClash)

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
- openssl-util
- curl
- jsonfilter
- ca-certificates

## Clash on Other Platforms

- [Clash for Windows](https://github.com/Fndroid/clash_for_windows_pkg/releases) : A Windows GUI based on Clash
- [clashX](https://github.com/yichengchen/clashX) : A rule based custom proxy with GUI for Mac base on clash
- [ClashA](https://github.com/ccg2018/ClashA/tree/master) : An Android GUI for Clash
- [ClashForAndroid](https://github.com/Kr328/ClashForAndroid) : Another Android GUI for Clash
- [KoolClash OpenWrt/LEDE](https://github.com/SukkaW/Koolshare-Clash/tree/master) : A rule based custom proxy for Koolshare OpenWrt/LEDE based on Clash
- [OpenClash](https://github.com/vernesong/OpenClash/tree/master) : Another Clash Client For OpenWrt
## License

Luci For Clash - OpenWrt is released under the GPL v3.0 License - see detailed [LICENSE](https://github.com/frainzy1477/luci-app-clash/blob/master/LICENSE) .


