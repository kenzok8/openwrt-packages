include $(TOPDIR)/rules.mk

PKG_NAME:=luci-theme-liquid
PKG_VERSION:=1.0
PKG_RELEASE:=22

PKG_MAINTAINER:=然后七年 <z@7ze.top>
PKG_LICENSE:=Apache-2.0

# OpenWrt 23.05 的 luci.mk 版本规则只取 PKG_VERSION（忽略 PKG_RELEASE），
# 导致 GitHub Action 编译出的 ipk 没有 r 小版本（0.4 vs 0.4-r1）。
# 用 override VERSION 强制统一为 PKG_VERSION-rPKG_RELEASE。注意：必须
# 写在 include luci.mk 之前——luci.mk 末尾会立即 eval BuildPackage，
# 其 ipk 命名/control 里的 $(VERSION) 在那一刻固化，写后面就晚了。
# luci.mk 的 VERSION:= 是普通赋值（被 override 压住），且本值在新版
# luci.mk 与 i18n 子包（PKG_PO_VERSION）下与默认一致，不影响 apk/新版。
override VERSION:=$(if $(PKG_RELEASE),$(PKG_VERSION)-r$(PKG_RELEASE),$(PKG_VERSION))

LUCI_TITLE:=Liquid glass theme for LuCI (>= 23)
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+luci-base

# 汉化/子包版本与主包保持同步
PKG_PO_VERSION:=$(PKG_VERSION)-r$(PKG_RELEASE)

# csstidy 会破坏 @media 块（只保留首条规则，其余泄漏到块外无条件生效），
# 导致移动端断点样式全部失效；本主题关闭 CSS 压缩，样式原样打包。
CONFIG_LUCI_CSSTIDY:=

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	# 公钥信任不在此处写（去冗余）：apk 装机时生成的 post-install 会先
	# 调 default_postinst —— 它会执行包内 etc/uci-defaults/99-zed-apk-key-liquid
	# 完成公钥条件写入并消费该脚本；固件场景由首次开机执行同一脚本覆盖
	# （构建期 --no-scripts 不跑脚本，文件随镜像保留）；装 r9 之前的设备
	# 由 OTA 安装前自举兜底。23.05 为 opkg 系统，不使用 apk 钥匙。

	# 23.05 opkg 不执行 uci-defaults，必须在 postinst 中设置主题配置。
	# 确保 mediaurlbase 指向 liquid，否则 fallback 到 null。
	if [ "$$(uci -q get luci.main.mediaurlbase)" != "/luci-static/liquid" ]; then
		uci set luci.main.mediaurlbase=/luci-static/liquid
		uci commit luci
	fi

	rm -f /tmp/luci-indexcache.*
	rm -rf /tmp/luci-modulecache/
	/etc/init.d/rpcd reload 2>/dev/null
	exit 0
}
exit 0
endef

define Package/$(PKG_NAME)/postrm
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	uci -q delete luci.themes.Liquid
	[ "$$(uci -q get luci.main.mediaurlbase)" = "/luci-static/liquid" ] && \
		uci -q delete luci.main.mediaurlbase
	uci commit luci
}
exit 0
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
