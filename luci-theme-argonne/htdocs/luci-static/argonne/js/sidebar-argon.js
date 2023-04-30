/**
 *  Argon is a clean HTML5 theme for LuCI. It is based on luci-theme-material and Argon Template
 *
 *  luci-theme-argon
 *      Copyright 2023 Jerrykuku <jerrykuku@qq.com>
 *
 *  Have a bug? Please create an issue here on GitHub!
 *      https://github.com/jerrykuku/luci-theme-argon/issues
 *
 *  luci-theme-bootstrap:
 *      Copyright 2008 Steven Barth <steven@midlink.org>
 *      Copyright 2008 Jo-Philipp Wich <jow@openwrt.org>
 *      Copyright 2012 David Menting <david@nut-bolt.nl>
 *
 *  MUI:
 *      https://github.com/muicss/mui
 *
 *  luci-theme-material:
 *      https://github.com/LuttyYang/luci-theme-material/
 *
 *  Argon Theme
 *	    https://demos.creative-tim.com/argon-dashboard/index.html
 *
 *  Login background
 *      https://unsplash.com/
 *
 *  Licensed to the public under the Apache License 2.0
 */

    /**
     * Sidebar expand
     */
    var showSide = false;
    $(".showSide").click(function () {
        if (showSide) {
            $(".darkMask").stop(true).fadeOut("fast");
            $(".main-left").width(0);
            $(".main-right").css("overflow-y", "auto");
            showSide = false;
        } else {
            $(".darkMask").stop(true).fadeIn("fast");
            $(".main-left").width("15rem");
            $(".main-right").css("overflow-y", "hidden");
            showSide = true;
        }
    });

    $(".darkMask").click(function () {
        if (showSide) {
            showSide = false;
            $(".darkMask").stop(true).fadeOut("fast");
            $(".main-left").width(0);
            $(".main-right").css("overflow-y", "auto");
        }
    });

    $(window).resize(function () {
        if ($(window).width() > 921) {
            $(".main-left").css("width", "");
            $(".darkMask").stop(true);
            $(".darkMask").css("display", "none");
            showSide = false;
        }
    });
