# luci-app-guest-wifi

适用于 OpenWrt/LuCI 的访客 WiFi 配置插件。

## 功能特性

- **访客网络配置**: 通过 Web 界面配置独立的访客无线网络
- **加密选项**: 支持无加密、WPA2-PSK、WPA3-SAE、WPA2/WPA3 混合模式
- **AP 隔离**: 可选的客户端隔离功能，防止访客设备之间互相访问
- **自动生效**: 保存配置后自动重新加载无线设置

## 依赖

- `luci`
- `luci-base`
- `luci-compat` (用于兼容旧版 LuCI CBI 模型)

## 安装

```bash
# 添加 feed
echo 'src-git guestwifi https://github.com/kenzok78/luci-app-guest-wifi' >> feeds.conf.default
./scripts/feeds update -a
./scripts/feeds install -a -p guestwifi

# 编译
make package/luci-app-guest-wifi/compile V=s
```

## 使用说明

1. 访问 OpenWrt Web 管理界面 → 网络 → 访客WiFi
2. 添加访客 WiFi 配置段（如果没有自动创建）
3. 启用访客网络，设置 SSID 和加密方式
4. 可选启用 AP 隔离功能
5. 保存并应用

## 配置说明

| 选项 | 说明 |
|------|------|
| 启用 | 是否启用访客 WiFi |
| 网络名称(SSID) | 无线网络名称 |
| 加密方式 | 无/WPA2-PSK/WPA3-SAE/WPA2/WPA3混合 |
| 密码 | 无线连接密码（加密模式下必填）|
| AP 隔离 | 防止客户端之间互相通信 |

## 目录结构

```
luci-app-guest-wifi/
├── Makefile
├── luasrc/
│   ├── controller/           # LuCI 控制器
│   └── model/cbi/          # CBI 模型 (兼容旧版)
├── htdocs/luci-static/resources/view/
│   └── guest-wifi/wifi.js  # JavaScript 视图 (现代 LuCI)
├── po/                      # 翻译文件
└── root/
    ├── etc/
    │   ├── config/         # UCI 配置 (通过 LuCI 管理)
    │   ├── init.d/         # 启动脚本
    │   └── uci-defaults/   # 初始化脚本
    └── usr/share/
        ├── luci/menu.d/   # 菜单配置
        └── rpcd/acl.d/    # ACL 权限
```

## 工作原理

- 插件通过 UCI 配置管理 `/etc/config/wireless` 中的 `wifi-iface` 段落
- 通过在 `wifi-iface` 配置中添加 `option guest_wifi '1'` 来标识访客网络
- 控制器和视图会自动过滤显示所有标记为访客的 WiFi 配置段

## 许可证

Apache-2.0
