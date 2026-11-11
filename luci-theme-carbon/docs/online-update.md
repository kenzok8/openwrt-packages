# Carbon online updates / 网页在线升级

## 使用

1. 首次手动安装 v1.1.0 或更新的原生 APK/IPK 包，退出并重新登录 LuCI，使新增 RPC 权限生效。
2. 打开「系统 → Carbon 主题」（v1.1.0 中名为「Carbon 更新」）。简洁和专业模式都有入口。
3. 点击「检查更新」，查看当前版本、最新稳定版和更新说明。
4. 点击「一键升级」，确认目标版本。后台执行下载、校验和安装，页面显示进度及日志；刷新页面不会取消安装。
5. 成功后点击「刷新页面」。升级到 v1.1.2 或更新版本时，主题自动刷新当前会话的菜单缓存，无需退出登录或重启路由器。

v1.1.0 / v1.1.1 的旧菜单名称缓存问题已在 v1.1.2 修复。可以直接从这两个版本通过网页升级到最新版，完成后刷新即可。首次安装更新器带来的新增 RPC 权限与菜单缓存不同，仍需按第 1 步重新登录一次。

更新保留 LuCI 语言、当前主题选择及浏览器中的浅色/深色、导航偏好。安装过程中请不要断电或同时操作其他软件包。安装失败时会显示原生包管理器日志；更新器不会声称自动回滚，也不会强制覆盖文件或忽略依赖。

更新说明以本地 Markdown 预览显示（v1.1.2 之后的版本），包括标题、列表、表格、引用、链接和代码块。原始 HTML 作为文本显示，不执行其中的脚本；链接在新标签页打开，状态轮询不会重建内容。

只读 LuCI 用户可以查看状态和检查更新，安装操作单独要求 `luci-theme-carbon-update` 的写权限。没有安装权限时升级按钮禁用。后台只接受已检查的目标版本，不接受浏览器传入下载地址、包路径、Shell 命令或密钥。

## 下载镜像（可选）

GitHub 下载缓慢或无法访问时，在同一页面的「下载镜像」中填写一个 HTTPS 前缀，例如 `https://mirror.example.com/`。下载地址变为前缀加原始链接：`https://mirror.example.com/https://github.com/mrjoechen/luci-theme-carbon/releases/download/…`。设置保存在 `/etc/config/carbon`（`carbon.update.mirror`），升级时保留。

- 镜像只用于下载安装包。版本、文件大小和 SHA-256 仍直接从 `api.github.com` 读取；镜像返回的文件必须与之完全一致，APK 还要通过签名校验。镜像无法篡改要安装的内容。
- 镜像失败或文件不一致时，自动改用 GitHub 直连；日志会显示每次尝试的来源。
- 只接受 `https://` 前缀，主机名和路径仅允许字母、数字及 `. _ ~ % + -`，最长 200 字符。留空即关闭。
- 检查更新本身仍需能访问 `api.github.com`。

## 签名与下载

- 固定来源：`mrjoechen/luci-theme-carbon` 的最新非草稿、非预发布 GitHub Release。
- APK：检查 GitHub 发布附件的 SHA-256、大小、实际包名和版本，再通过 `/usr/share/carbon/keys/carbon-apk.pem` 验证签名。安装时再次启用 APK 原生签名校验。没有 `--allow-untrusted`、自动下载新密钥或全局关闭验签的回退。
- 包内公钥仅用于 Carbon 更新器的独立信任目录，不会自动加入系统 `/etc/apk/keys`。标准 LuCI 上传仍按 [APK 配置说明](apk-install.md)导入公钥。
- APK 使用本地包及已安装依赖，跳过远端固件索引。缺失依赖时会失败，请先修复软件源并安装依赖。
- IPK：通过 HTTPS 获取发布元数据和包，核对 SHA-256、大小及包名/版本，使用原生 opkg 安装。IPK 不具有本项目 APK 的签名保证。
- 版本判断由设备原生包管理器执行，只允许更高版本；检查结果有效期为 30 分钟。
- 同一设备只运行一个任务。任务采用独立进程及文件锁，页面关闭或 rpcd 重载不会主动取消它。设备重启后临时状态会丢失；重新打开页面以包管理器中的实际版本为准。

## 常见问题

- **没有更新入口**：旧版未包含更新器，先安装新包并重新登录。确认 `rpcd` 已加载 `luci.carbon_update`。
- **提示「请先通过系统包管理器安装一次 Carbon」**：主题是复制文件安装的（`--files` 或 v1.1.3 之前的安装脚本），apk/opkg 中没有记录。重新运行一次当前的 `carbon-install.sh`：它会通过包管理器安装内置的签名包，无需导入公钥；也可以手动安装 APK/IPK。更新器本身不会把未登记的文件强制接管给包管理器。
- **缺少工具**：需要 `curl`、`ca-bundle` 和 `flock`，通常随包依赖安装。不要为解决 HTTPS 问题关闭证书校验。
- **下载失败**：检查路由器时间、DNS、外网和 GitHub 连通性；GitHub API 限流也会导致检查失败，稍后重试。
- **签名/校验失败**：没有执行安装。重新检查并下载；若持续失败，请提供错误和日志，不要禁用签名验证。
- **安装失败或中断**：查看日志及已安装版本。包管理器可能已部分执行，先处理其报错再重试；不要在安装过程中强行中止。
- **原始 SDK/Actions 临时产物**：在线更新只使用正式 Release 中的已签名 APK，不使用未签名的 CI 构建产物。

## English

Install the native v1.1.0+ APK/IPK once, then log out/back in to activate the newly added RPC permissions. Open **System → Carbon Theme Settings** (**Carbon Update** in v1.1.0), check for updates, review the notes and confirm **Install update**. Progress and logs survive page refreshes. When upgrading to v1.1.2 or later, reload after success; neither logout nor a router reboot is needed. Read-only users cannot install updates.

v1.1.2 refreshes LuCI's cached menu automatically when the Carbon version changes, including upgrades from v1.1.0 and v1.1.1. It preserves the login session and unrelated session data. First-time RPC permission activation still requires the initial login described above.

The updater only accepts newer stable releases from the fixed Carbon repository. It verifies size, SHA-256, package name/version and, for APK, the bundled Carbon public key. APK verifies the signature again during installation with the same isolated key directory and no firmware repository access. System trust settings are unchanged. IPK uses HTTPS, size and SHA-256 validation rather than APK signing. Existing dependencies must be available. Checks expire after 30 minutes, and a lock prevents overlapping updates.

Preferences and router configuration are retained. Installs made by copying files (`carbon-install.sh --files`, or installers before v1.1.3) are not registered with apk/opkg; run the current `carbon-install.sh` once, which installs the embedded signed package natively. Failed installations display logs and do not promise rollback; check the actual installed version before retrying. GitHub connectivity, correct system time, `curl`, `ca-bundle` and `flock` are required.

### Download mirror

If GitHub downloads are slow or blocked, set an optional HTTPS prefix under **Download mirror** on the same page (stored as `carbon.update.mirror` in `/etc/config/carbon`). The package URL becomes `<prefix>https://github.com/…`. Only the package bytes use the mirror: release metadata, size and SHA-256 still come from `api.github.com`, and APKs are signature-checked as before, so a mirror cannot change what gets installed. If the mirror fails or returns a mismatching file, the updater falls back to GitHub. Checking for updates still needs `api.github.com`.

## Maintainers

Publish version tags matching `Makefile`; GitHub Release asset names must remain `luci-theme-carbon-VERSION-rN.apk` and `luci-theme-carbon_VERSION-rN_all.ipk`. GitHub supplies each asset's SHA-256 digest through its release API. Upload APKs only after signing. Keep `root/usr/share/carbon/version` in sync with the package version and the bundled public key identical to `keys/carbon-apk.pem`. The CI checks both.

Run `python tests/update-integration.py` with Docker to test the production RPC script against OpenWrt's real APK manager, disposable signed packages and deterministic download fixtures. Signing and installation are never mocked. This suite checks bad signatures, bad checksums, incorrect metadata, network errors, expired requests, downgrades, concurrency, progress recovery, configuration preservation, mirror validation and fallback from a failing or tampered mirror.

Run `python tests/opkg-update.py` for the native OpenWrt 24.10 IPK upgrade regression, including legacy removal hooks that reset the theme. Both suites run before Release publication.
