# 
# Copyright (C) 2018-2023 Ruilin Peng (Nick) <pymumu@gmail.com>.
#
# smartdns is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# smartdns is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

include $(TOPDIR)/rules.mk

PKG_LICENSE:=GPL-3.0-or-later
PKG_MAINTAINER:=Nick Peng <pymumu@gmail.com>
PKG_VERSION:=1.2023.41
PKG_RELEASE:=1

LUCI_TITLE:=LuCI for smartdns
LUCI_DESCRIPTION:=Provides Luci for smartdns
LUCI_DEPENDS:=+smartdns +luci-compat
LUCI_PKGARCH:=all

define Package/$(PKG_NAME)/config
# shown in make menuconfig <Help>
help
	$(LUCI_TITLE)
	Version: $(PKG_VERSION)-$(PKG_RELEASE)
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
