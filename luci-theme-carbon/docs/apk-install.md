# APK 安装 / APK installation

## 中文

从 **v1.0.1** 开始，Release 中的 APK 使用 Carbon 固定公钥对应的私钥签名。每台设备只需导入一次公钥，后续可以直接通过 LuCI 上传安装或升级，无需每次 SSH。v1.0.0 的旧 APK 未签名，导入公钥后也不能直接上传安装，请重新下载新版。

> **最简单的方式：** 使用 Release 中的 `carbon-install.sh`。它内置签名 APK 和公钥，在独立的密钥目录中验签后通过 apk 安装，无需导入公钥，在线升级也可用。加 `--trust-key` 参数时会同时把公钥加入 `/etc/apk/keys`。下面的步骤用于在 LuCI 中手动上传 APK。

### 首次配置：优先通过网页导入公钥

1. 从 [Release](https://github.com/mrjoechen/luci-theme-carbon/releases/latest) 下载 `carbon-apk.pem` 和 `luci-theme-carbon-*.apk`。公钥也保存在仓库的 `keys/carbon-apk.pem`。
2. 切到 Carbon「专业」模式，在 **系统 → 管理权（Administration）→ 软件源公钥（Repo Public Keys）** 中，粘贴公钥文件的完整内容并点击「添加密钥」。有些版本也支持拖入公钥文件。此页面与 SSH 公钥页面不同。
3. 在 **系统 → 软件包 → 上传软件包** 中上传新版 `.apk` 并安装。重复安装相同版本时，如界面提供「重新安装」选项，可勾选它。
4. 刷新页面。首次安装更新器时，退出并重新登录 LuCI，使新增 RPC 权限生效；已有 v1.1.x 升级到 v1.1.2 或更新版本，只需刷新，无需退出。

菜单名称取决于固件翻译；较旧的 LuCI 可能没有公钥管理页。这种情况使用下面的一次性 SSH 配置，之后仍通过网页上传 APK。

### 旧版 LuCI：一次性 SSH 配置

下面命令先下载到临时目录，核对公钥文件的 SHA-256，再加入信任目录；不修改固件自带密钥，也不关闭签名校验。

```sh
(
  set -eu
  key=/tmp/carbon-apk.pem
  wget -O "$key" https://github.com/mrjoechen/luci-theme-carbon/releases/download/v1.0.1/carbon-apk.pem
  printf '%s  %s\n' c5187568040b024559e6dddbd752c4661455b0ccfb94a66b013f05eb28ef9a0b "$key" | sha256sum -c -
  mkdir -p /etc/apk/keys
  cp "$key" /etc/apk/keys/carbon-apk.pem
  chmod 644 /etc/apk/keys/carbon-apk.pem
)
```

路由器无法下载时，在电脑下载公钥后，用 SCP（例如 `scp -O carbon-apk.pem root@192.168.1.1:/tmp/`）传到 `/tmp`，跳过上面的 `wget`，继续校验和复制。公钥文件 SHA-256：

```text
c5187568040b024559e6dddbd752c4661455b0ccfb94a66b013f05eb28ef9a0b
```

固件升级时需要保留此公钥。可在 **系统 → 备份/升级 → 配置** 的保留文件列表加入 `/etc/apk/keys/carbon-apk.pem`；恢复出厂设置或不保留配置刷机后重新导入。卸载主题不会移除手动导入的公钥。不再信任本项目时，删除这一个公钥文件即可；不要删除官方密钥。APK 的信任是按密钥而不是按包名授权，请仅从本项目获取公钥和发布包。

### 排错

- **`UNTRUSTED signature`**：确认上传的是 v1.0.1 或更新 Release 的 APK，且已导入匹配的公钥。SDK 原始构建产物、Actions 的 `sdk-*` 临时产物以及旧 v1.0.0 APK 不带正式发布签名。必要时用 `apk verify /tmp/upload.apk` 检查（LuCI 安装结束可能已清理上传文件）。
- **`wget: exited with error 4` / `packages.adb: unexpected end of file`**：这是固件软件源索引下载失败，与 Carbon 签名无关。先在软件包页面尝试「更新列表」，检查路由器时间、DNS、WAN 和 HTTPS 连通性，以及软件源与当前 ImmortalWrt/OpenWrt 版本、target、架构是否匹配。不要混用两个发行版的软件源，也不要随意切到其它 snapshot 或发行版来解决依赖。签名修复不会修复软件源连接。
- **离线安装**：依赖已经安装时，可用 `apk add --repositories-file /dev/null /tmp/luci-theme-carbon-1.0.1-r1.apk` 跳过软件源，仅校验本地包。它仍验证签名，不需要 `--allow-untrusted`。标准 LuCI 上传流程没有通用的“忽略所有软件源”开关；要持续使用网页安装，应修复软件源问题。
- **`Read-only file system`**：系统根目录必须可写。这是容器或存储配置问题，与包签名不同。

## English

The simplest route is the release's `carbon-install.sh`: it embeds the signed APK and the public key, verifies the APK in a private key directory and installs it with apk — no key import needed, and online updates work. `--trust-key` additionally adds the key to `/etc/apk/keys`. The steps below are for manual LuCI uploads.

Release APKs are individually signed starting with **v1.0.1**. Import the Carbon public key once per device; subsequent installs and upgrades can use LuCI's package upload. The old v1.0.0 APK is unsigned and must be replaced with a new download.

1. Download `carbon-apk.pem` and the APK from [Releases](https://github.com/mrjoechen/luci-theme-carbon/releases/latest).
2. In Carbon's **Pro** mode, open **System → Administration → Repo Public Keys** if your firmware provides it. Paste the full public key and click **Add key**. This is separate from SSH authorized keys.
3. Open **System → Software → Upload Package**, select the APK and install. Select reinstall if the interface offers it when installing the same version again.
4. Refresh and log out/back in.

Older LuCI versions need a one-time SSH import: use the shell block above, which verifies the public PEM's SHA-256 before copying it to `/etc/apk/keys/carbon-apk.pem`. If the router cannot download the key, copy it from your computer to `/tmp/carbon-apk.pem` and skip `wget`. No global signature bypass is needed.

Add `/etc/apk/keys/carbon-apk.pem` to the backup file list in **System → Backup / Flash Firmware → Configuration** to retain it across upgrades. Re-import after a factory reset or an upgrade without preserved settings. Removing the theme does not remove this manually imported key. Delete only this key to revoke trust; preserve official keys. A trusted APK key is not restricted to a particular package name.

`UNTRUSTED signature` means the key is absent/mismatched, the file is an old unsigned release, or it is a raw SDK/Actions artifact. Use signed **Release assets**. `wget` / truncated `packages.adb` warnings are separate firmware repository download failures: check time, DNS, WAN, HTTPS, and firmware/target/architecture compatibility. Do not mix OpenWrt and ImmortalWrt feeds. If dependencies are already installed, the offline command above skips feeds while retaining signature verification; standard LuCI uploads still need working feed configuration. A read-only root filesystem must also be fixed separately.

## References

- [LuCI public-key management](https://github.com/openwrt/luci/blob/master/modules/luci-mod-system/htdocs/luci-static/resources/view/system/repokeys.js)
- [APK v3 signing](https://github.com/alpinelinux/apk-tools/blob/master/doc/apk-adbsign.8.scd)
- [APK trust directories and repository options](https://github.com/alpinelinux/apk-tools/blob/master/doc/apk.8.scd)
