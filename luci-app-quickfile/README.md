# luci-app-quickfile

`luci-app-quickfile` 是一款专为 OpenWrt 设计的轻量级网页端文件管理器。

---

## 如何编译

```sh
git clone https://github.com/sbwml/luci-app-quickfile package/quickfile
make menuconfig # choose LUCI -> Applications -> luci-app-quickfile
make package/quickfile/luci-app-quickfile/compile V=s
```

注意：由于 quickfile 直接使用 OpenWrt 令牌进行登录验证，它需要依赖 `nginx` 配合使用，这可能会让你的 LuCI 失去工作。

*⚠ 非开发人员不建议自行编译使用*

---

## 相关设置

 - **禁用不可信的 SSL 证书（浏览器会拒绝通过不可信证书获取 Session ID）**

```nginx
# nginx
uci set nginx.global.uci_enable='true'
uci del nginx._lan
uci del nginx._redirect2ssl
uci add nginx server
uci rename nginx.@server[0]='_lan'
uci set nginx._lan.server_name='_lan'
uci add_list nginx._lan.listen='80 default_server'
uci add_list nginx._lan.listen='[::]:80 default_server'
uci add_list nginx._lan.include='conf.d/*.locations'
uci set nginx._lan.access_log='off; # logd openwrt'
uci commit nginx
service nginx restart
```

 - **文件上传大小受限**

通过编辑 `/etc/nginx/conf.d/quickfile.locations` 文件并修改 `client_body_temp_path` 临时目录为大容量目录可避免文件上传大小受限而失败。

https://github.com/sbwml/luci-app-quickfile/blob/5d863b91bc1d555dea65ecce6e30786c7d12273e/quickfile/files/quickfile.locations#L1-L8

---

## 功能简介

### 文件管理
- 基础操作：支持目录浏览、文件/文件夹的创建、重命名、移动和删除。
- 便捷传输：提供标准的文件上传与下载功能，并支持通过浏览器拖拽直接上传文件，同时支持在线下载文件。
- 解压缩：支持 `zip`、`tar.gz`、`tar.xz` 文件的压缩/解压。

### 命令终端
- 实时命令行：内置网页终端功能，支持直接在管理界面中执行当前目录系统命令，便于用户进行快速批量操作文件、调试与系统维护。

### 软件包管理 (IPK / APK)
- 直接安装：支持在网页端直接执行本地上传的 `.ipk` 或 `.apk` 软件包安装。
- 依赖解析：当出现安装失败或缺少依赖时，支持同步刷新软件源并尝试自动补齐依赖。
- 状态反馈：内置安装日志捕获，清晰输出安装成功或失败的反馈信息，便于故障排查。

### 媒体预览
- 多媒体支持：内置主流格式的图片和视频预览组件，无需下载至本地即可直接在浏览器中查看。

### 文本编辑器
- Monaco 核心：集成轻量化 Monaco Editor 文本编辑器。
- 代码高亮：支持多种配置文件及脚本语言的语法高亮显示，方便用户直接在线编辑和调整路由器配置。

---

<img width="1600" height="1126" alt="image" src="https://github.com/user-attachments/assets/c31a20eb-d2c9-4be3-bafb-83836295e5a8" />
