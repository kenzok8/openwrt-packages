# luci-app-aliddns
LEDE/OpenWrt LuCI for AliDDNS
===

简介
---

本软件包是 AliDDNS 的 LuCI 控制界面,

软件包文件结构:
```
/
├── etc/
│   ├── config/
│   │   └── aliddns                            // UCI 配置文件
│   │── init.d/
│   │   └── aliddns                            // init 脚本
│   └── uci-defaults/
│       └── luci-aliddns                        // uci-defaults 脚本
└── usr/
    ├── sbin/
    │   └── aliddns                             // 主程序
    └── lib/
        └── lua/
            └── luci/                            // LuCI 部分
                ├── controller/
                │   └── aliddns.lua             // LuCI 菜单配置
                ├── i18n/                        // LuCI 语言文件目录
                │   └── aliddns.zh-cn.lmo
                └── model/
                    └── cbi/
                        └── aliddns.lua          // LuCI 基本设置
```

依赖
---

软件包的正常使用需要依赖 `openssl-util` 和 `curl`.  

配置
---

软件包的配置文件路径: `/etc/config/aliddns`  
此文件为 UCI 配置文件, 配置方式可参考 [Wiki][uci]  

编译
---

从 LEDE 的 [SDK][lede-sdk] 编译  
```bash
# 解压下载好的 SDK
tar axvf lede-sdk-17.01.*-ar71xx-generic_gcc-5.4.0_musl-1.1.16.Linux-x86_64.tar.xz
cd lede-sdk-17.01.*-ar71xx-*
# Clone 项目
mkdir -p package/feeds
git clone https://github.com/chenhw2/luci-app-aliddns.git package/feeds/luci-app-aliddns
# 编译 po2lmo (如果有po2lmo可跳过)
pushd package/feeds/luci-app-aliddns/tools/po2lmo
make && sudo make install
popd
# 选择要编译的包 LuCI -> 3. Applications
make menuconfig
# 开始编译
make package/feeds/luci-app-aliddns/compile V=s
```

 [lede-sdk]: https://lede-project.org/docs/guide-developer/compile_packages_for_lede_with_the_sdk
 [uci]: https://lede-project.org/docs/user-guide/introduction_to_lede_configuration
