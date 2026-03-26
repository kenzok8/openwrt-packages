# luci-app-filebrowser

适用于 OpenWrt/Lede 的 FileBrowser LuCI 控制面板插件。

## 功能特性

- **Web 文件管理**: 通过美观的 Web 界面管理服务器上的文件
- **多架构支持**: 自动检测 x86_64、aarch64、ramips、ar71xx、armv5/6/7/8 等架构
- **自动下载更新**: 自动从 GitHub releases 获取最新版本并下载
- **配置管理**: 支持 SSL、自定义端口、数据库路径等
- **日志查看**: 实时查看 FileBrowser 运行日志

## 依赖

- `luci`
- `luci-base`
- `filebrowser` (主程序)

## 安装

### OpenWrt Feed 方式

```bash
# 添加 feed
echo 'src-git filebrowser https://github.com/kenzok78/luci-app-filebrowser' >> feeds.conf.default
./scripts/feeds update -a
./scripts/feeds install -a -p filebrowser

# 编译
make package/luci-app-filebrowser/compile V=s
```

### 直接编译

```bash
git clone https://github.com/kenzok78/luci-app-filebrowser.git package/luci-app-filebrowser
make menuconfig  # 选择 LuCI -> Applications -> luci-app-filebrowser
make -j$(nproc) V=s
```

## 使用说明

### 基本配置

1. 访问 OpenWrt Web 管理界面 → 服务 → File Browser
2. 启用插件
3. 设置可执行文件存放目录（建议使用 `/tmp` 或挂载的 USB 存储）
4. 点击"手动下载"获取 FileBrowser 二进制文件
5. 保存并应用配置

### 配置说明

| 选项 | 说明 | 默认值 |
|------|------|--------|
| 监听地址 | 绑定地址 | 0.0.0.0 |
| 监听端口 | Web 界面端口 | 8088 |
| 数据库路径 | SQLite 数据库文件位置 | /etc/filebrowser.db |
| 初始账户 | 登录用户名 | admin |
| 初始密码 | 登录密码 | admin |
| SSL 证书 | HTTPS 证书路径 | 空 |
| SSL 私钥 | HTTPS 私钥路径 | 空 |
| 根目录 | 文件浏览的起始目录 | /root |
| 可执行文件目录 | 二进制文件存放位置 | /tmp |

## 配置示例

### /etc/config/filebrowser

```
config global
	option address '0.0.0.0'
	option port '8088'
	option database '/etc/filebrowser.db'
	option username 'admin'
	option password 'admin'
	option ssl_cert ''
	option ssl_key ''
	option root_path '/root'
	option executable_directory '/tmp'
	option enable '1'
```

## 目录结构

```
luci-app-filebrowser/
├── luasrc/
│   ├── controller/          # LuCI 控制器
│   ├── model/cbi/          # CBI 模型
│   └── view/               # HTML 视图模板
├── po/                     # 翻译文件
├── root/
│   ├── etc/
│   │   ├── config/        # UCI 配置
│   │   └── init.d/        # 启动脚本
│   └── usr/share/rpcd/     # ACL 配置
├── Makefile
└── README.md
```

## 常见问题

### Q: 下载失败怎么办？

检查网络连接，确保可以访问 GitHub。也可以手动下载 FileBrowser 二进制文件并放置到指定目录。

### Q: 如何手动下载二进制文件？

访问 [FileBrowser Releases](https://github.com/filebrowser/filebrowser/releases) 下载对应架构的版本，解压后放置到可执行文件目录。

### Q: 如何查看日志？

通过 LuCI 界面的日志区域查看，或：

```bash
cat /var/log/filebrowser.log
```

## 许可证

Apache-2.0

## 来源

- [FileBrowser](https://github.com/filebrowser/filebrowser)
- 基于 Lienol 的 luci-app-filebrowser 维护
