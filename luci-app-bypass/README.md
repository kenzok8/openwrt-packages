### 特色
1.  Trojan-Go 支持
1.  DNS over Https(DoH) 支持
1.  基于ChinaDNS-NG的国外智能DNS解析
1.  国内DNS方案集成
1.  故障转移支持中转节点
1.  功能与视觉体验增强
1.  其他大量修复与优化

[TG交流与反馈](https://t.me/opwrts)

### 相关依赖 

Lua-Maxminddb: https://github.com/garypang13/openwrt-packages/tree/master/lua-maxminddb

lean等源码编译本插件前请先执行

```
find package/*/ feeds/*/ -maxdepth 2 -path "*luci-app-bypass/Makefile" | xargs -i sed -i 's/shadowsocksr-libev-ssr-redir/shadowsocksr-libev-alt/g' {}
find package/*/ feeds/*/ -maxdepth 2 -path "*luci-app-bypass/Makefile" | xargs -i sed -i 's/shadowsocksr-libev-ssr-server/shadowsocksr-libev-server/g' {}
```

#### 默认集成的DNS方案已是最优解,不推荐再与其他DNS插件比如adg搭配使用. 去广告推荐使用基于dnsmasq的 [luci-app-dnsfilter](https://github.com/garypang13/luci-app-dnsfilter)

![](https://raw.githubusercontent.com/garypang13/luci-app-bypass/main/screenshot.png)

### 感谢
https://github.com/fw876/helloworld

https://github.com/small-5

https://github.com/xiaorouji/openwrt-passwall/tree/main/luci-app-passwall

https://github.com/jerrykuku/luci-app-vssr
