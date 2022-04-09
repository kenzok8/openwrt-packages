#!/bin/bash
# --------------------------------------------------------
# Script for creating ACL file for each LuCI APP
sed -i \
-e 's?include \.\./\.\./\(lang\|devel\)?include $(TOPDIR)/feeds/packages/\1?' \
-e "s/\(PKG_HASH\|PKG_MD5SUM\|PKG_MIRROR_HASH\):=.*/\1:=skip/" \
-e 's?2. Clash For OpenWRT?3. Applications?' \
-e 's?\.\./\.\./luci.mk?$(TOPDIR)/feeds/luci/luci.mk?' \
-e 's/ca-certificates/ca-bundle/' \
*/Makefile

sed -i 's?zstd$?zstd ucl upx\n$(curdir)/upx/compile := $(curdir)/ucl/compile?g' tools/Makefile
sed -i 's/luci-lib-ipkg/luci-base/g' luci-app-store/Makefile

sed -i "/minisign:minisign/d" luci-app-dnscrypt-proxy2/Makefile
sed -i 's/+libstdcpp/+libstdcpp +zlib/' ngrokc/Makefile
sed -i 's/+dockerd/+dockerd +cgroupfs-mount/' luci-app-docker*/Makefile
sed -i '$i /etc/init.d/dockerd restart &' luci-app-docker*/root/etc/uci-defaults/*
sed -i 's/+rclone\( \|$\)/+rclone +fuse-utils\1/g' luci-app-rclone/Makefile
sed -i 's/+libcap /+libcap +libcap-bin /' luci-app-openclash/Makefile
sed -i 's/\(+luci-compat\)/\1 +luci-theme-argon/' luci-app-argon-config/Makefile
sed -i 's/+vsftpd$/+vsftpd-alt/' luci-app-vsftpd/Makefile
sed -i 's/ +uhttpd-mod-ubus//' luci-app-packet-capture/Makefile
sed -i '/boot()/,+2d' ddns-scripts/files/etc/init.d/ddns
sed -i "/DISTRIB_DESCRIPTION/c\DISTRIB_DESCRIPTION=\"%D %C by kenzo'\"" base-files/files/etc/openwrt_release
sed -i 's?admin/status/channel_analysis??' luci-mod-status/root/usr/share/luci/menu.d/luci-mod-status.json
sed -i "/--disable-https/d" netdata/Makefile
-e '/\/etc\/profile/d' \
-e '/\/etc\/shinit/d' \
base-files/files/lib/upgrade/keep.d/base-files-essential
sed -i -e '/^\/etc\/profile/d' \
-e '/^\/etc\/shinit/d' \
base-files/Makefile
sed -i '$a cgi-timeout = 300' uwsgi/files-luci-support/luci-webui.ini
sed -i '$a cgi-timeout = 60' uwsgi/files-luci-support/luci-cgi_io.ini
sed -i '/limit-as/c\limit-as = 5000' uwsgi/files-luci-support/luci-webui.ini
sed -i 's/procd_set_param stderr 1/procd_set_param stderr 0/' uwsgi/files/uwsgi.init
cp -rf base-files/files/sbin/sysupgrade my-default-settings/files/sbin/
sed -i "s/CONFLICTS:=kmod-r8169//" r8168/Makefile

bash diy/create_acl_for_luci.sh -a >/dev/null 2>&1
bash diy/convert_translation.sh -a >/dev/null 2>&1

rm -rf create_acl_for_luci.err & rm -rf create_acl_for_luci.ok
rm -rf create_acl_for_luci.warn

exit 0
