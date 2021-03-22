#### 说明


* 软件不定期同步大神库更新，适合一键下载到package目录下，用于openwrt编译


* 两位L大库里都删除了某软件，作为搬运工，passwall的依赖一并找齐了


- [passwall依赖库下载链接，注意！在openwrt或者lean源码下编译passwall，要下载此依赖库](https://github.com/kenzok8/small.git)


- [或者Lienol   passwall新库地址](https://github.com/xiaorouji/openwrt-passwall.git)
 

1、 lede/package$下运行 或者openwrt/package$下运行


```bash
 git clone https://github.com/Gabrielxzx/openwrt-packages.git
```

 2、 或者添加下面代码到 openwrt 或lede源码根目录feeds.conf.default文件
 
```bash
 src-git kenzo https://github.com/Gabrielxzx/openwrt-packages
```

 3、 passwall依赖
 
 ```bash
 src-git small https://github.com/kenzok8/small
 ```
 
- openwrt 固件编译自定义主题与软件
- luci-app-dnsfilter       ------------------基于DNS的广告过滤
- luci-app-openclash       ------------------openclash图形              
- luci-app-eqos            ------------------依IP地址限速
- luci-app-adguardhome     ------------------去广告 
- luci-app-smartdns        ------------------smartdns防污染
- luci-app-passwall        ------------------Lienol大神 
- luci-app-ssr-plus        ------------------Lean大神
- luci-app-jd-dailybonus   ------------------老竭力 
