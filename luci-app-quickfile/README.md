# luci-app-quickfile

一款专为 OpenWrt 设计的高性能轻量 Web 文件管理器。后端采用 Rust 构建，前端基于 Vue 3 + Vite + Tailwind CSS。

---

## 界面预览

| 浅色模式 | 深色模式 |
| :---: | :---: |
| <img src="https://github.com/user-attachments/assets/5528b8d7-f23f-4e81-9729-1ac00265d3b9" alt="Light Theme" /> | <img src="https://github.com/user-attachments/assets/dde7e9c5-605b-4c02-ac3b-33393c25a302" alt="Dark Theme" /> |

---

## 主要特性

- **文件浏览与管理**
  - 提供列表与网格两种视图，支持按名称、体积、修改时间排序
  - 文件列表与分页流式加载，首屏响应迅速，滚动平滑加载海量文件
  - 完整键鼠交互：鼠标框选、多选（`Ctrl` / `Shift`）、全选（`Ctrl+A`）
  - 右键上下文菜单：新建、重命名、权限修改（chmod）、属性查看、复制、剪切、粘贴、压缩与解压
- **传输与上传**
  - 支持拖拽移动、拖拽上传文件及文件夹（自动保留目录树层级）
  - 支持剪贴板粘贴直接上传（`Ctrl+V` 图片与文件）
  - 上传管理面板：实时进度、速率显示、传输取消及同名覆盖/重命名策略
  - 远程 URL 离线下载
- **归档与压缩**
  - 支持格式：`zip`、`gz`、`tar`、`tar.gz`、`tar.xz`、`tar.zst`、`ipk`、`apk`、`img`、`ext4`、`squashfs`
  - ZIP 归档支持 WinZip AES-256 加密与解密
- **多媒体与文档预览**
  - 图片浏览器：支持平移、无级缩放与前后切换
  - 媒体播放：内置音频播放器与视频播放器（支持倍速、画中画、全屏）
  - PDF 阅读器：支持平滑滚动、旋转、分页与全文检索
- **开发与系统集成**
  - 内置终端：基于 xterm.js 与 WebSocket，自动定位至当前浏览目录
  - 代码编辑器：集成 CodeMirror 6，内置 40+ 语言高亮，主题自动联动，支持快捷键搜索（`Ctrl+F`）与保存（`Ctrl+S`）
  - 哈希校验：支持在文件属性中直接计算 MD5 与 SHA-256
- **OpenWrt 系统深度适配**
  - 支持 OpenWrt 24.10 / 25.12 软件包一键安装
  - `init.d` 服务管理：支持直接执行 `start`、`stop`、`restart`、`reload`、`enable`、`disable`
  - 原生 `ipk2apk` 转换：基于 Rust 独立实现 APK v3 (ADB 容器) 格式打包，无需依赖完整 `apk-tools` 即可完成 `.ipk` 至 `.apk` 转换并保留完整元数据

---

## 编译指南

```bash
# 克隆源码至 OpenWrt SDK 或源码根目录
git clone https://github.com/sbwml/luci-app-quickfile package/quickfile

# 配置并选择包: LuCI -> Applications -> luci-app-quickfile
make menuconfig

# 编译单独模块
make package/quickfile/luci-app-quickfile/compile V=s
```

**⚠** 本项目使用 OpenWrt 原生 Token 验证，Web 服务依赖 `nginx` 反向代理，非开发人员不建议自行编译使用。

---

## Nginx 配置参考

OpenWrt 下 Nginx 默认启用 HTTPS 与自签证书。如需改为标准 HTTP（80 端口）监听，可执行以下 UCI 指令：

```bash
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
