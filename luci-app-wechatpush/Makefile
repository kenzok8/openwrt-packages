include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-wechatpush
PKG_VERSION:=3.4.2
PKG_RELEASE:=

PKG_MAINTAINER:=tty228 <tty228@yeah.net>
PKG_CONFIG_DEPENDS:= \
        CONFIG_PACKAGE_$(PKG_NAME)_Enable_Traffic_Monitoring \
        CONFIG_PACKAGE_$(PKG_NAME)_Enable_Local_Disk_Information_Detection \
        CONFIG_PACKAGE_$(PKG_NAME)_Enable_Host_Information_Detection

LUCI_TITLE:=LuCI support for wechatpush
LUCI_PKGARCH:=all
LUCI_DEPENDS:=+iputils-arping +curl +jq +bash \
        +PACKAGE_$(PKG_NAME)_Enable_Traffic_Monitoring:wrtbwmon \
        +PACKAGE_$(PKG_NAME)_Enable_Local_Disk_Information_Detection:lsblk \
        +PACKAGE_$(PKG_NAME)_Enable_Local_Disk_Information_Detection:smartmontools \
        +PACKAGE_$(PKG_NAME)_Enable_Local_Disk_Information_Detection:smartmontools-drivedb \
        +PACKAGE_$(PKG_NAME)_Enable_Host_Information_Detection:openssh-client \
        +PACKAGE_$(PKG_NAME)_Enable_Host_Information_Detection:openssh-keygen

define Package/$(PKG_NAME)/config
config PACKAGE_$(PKG_NAME)_Enable_Traffic_Monitoring
        bool "Enable Traffic Monitoring"
        help
                The traffic statistics feature relies on the wrtbwmon package. This plugin may conflict with Routing/NAT, Flow Offloading, and proxy internet access plugins, potentially leading to an inability to retrieve traffic information.
        select PACKAGE_wrtbwmon
        depends on PACKAGE_$(PKG_NAME)
        default n
config PACKAGE_$(PKG_NAME)_Local_Disk_Information_Detection
        bool "Local Disk Information Detection"
        help
                If the lsblk package is not installed, the total disk capacity information might be inconsistent with actual values. When smartctl is not installed, information about disk temperature, power-on time, health status, and more will be unavailable. If you are using a virtual machine or have not installed a physical disk, this feature is typically unnecessary.
        select PACKAGE_lsblk
        select PACKAGE_smartmontools
        select PACKAGE_smartmontools-drivedb
        depends on PACKAGE_$(PKG_NAME)
        default n
config PACKAGE_$(PKG_NAME)_Host_Information_Detection
        bool "Host Information Detection"
        help
                When using a virtual machine and requiring information about the host machine's temperature and disk details, you need to install openssh-client and openssh-keygen for SSH connections.
        select PACKAGE_openssh-client
        select PACKAGE_openssh-keygen
        depends on PACKAGE_$(PKG_NAME)
        default n
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/wechatpush
/usr/share/wechatpush/api/diy.json
/usr/share/wechatpush/api/logo.jpg
/usr/share/wechatpush/api/ipv4.list
/usr/share/wechatpush/api/ipv6.list
/usr/share/wechatpush/api/device_aliases.list
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
