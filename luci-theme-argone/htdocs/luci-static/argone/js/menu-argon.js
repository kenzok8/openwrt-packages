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

    var lastNode = undefined;
    var mainNodeName = undefined;

    var nodeUrl = "";
    (function (node) {
        if (node[0] == "admin") {
            luciLocation = [node[1], node[2]];
        } else {
            luciLocation = node;
        }

        for (var i in luciLocation) {
            nodeUrl += luciLocation[i];
            if (i != luciLocation.length - 1) {
                nodeUrl += "/";
            }
        }
    })(luciLocation);

    /**
     * get the current node by Burl (primary)
     * @returns {boolean} success?
     */
    function getCurrentNodeByUrl() {
        var ret = false;
        const urlReg = new RegExp(nodeUrl + "$")
        if (!$('body').hasClass('logged-in')) {
            luciLocation = ["Main", "Login"];
            return true;
        }
        $(".main > .main-left > .nav > .slide > .active").next(".slide-menu").stop(true).slideUp("fast");
        $(".main > .main-left > .nav > .slide > .menu").removeClass("active");
        $(".main > .main-left > .nav > .slide > .menu").each(function () {
            var ulNode = $(this);

            ulNode.next().find("a").each(function () {
                var that = $(this);
                var href = that.attr("href");

                if (urlReg.test(href)) {
                    ulNode.click();
                    ulNode.next(".slide-menu").stop(true, true);
                    lastNode = that.parent();
                    lastNode.addClass("active");
                    ret = true;
                    return true;
                }
            });
        });
        return ret;
    }

    /**
     * menu click
     */
    $(".main > .main-left > .nav > .slide > .menu").click(function () {
        var ul = $(this).next(".slide-menu");
        var menu = $(this);
        if (!menu.hasClass("exit")) {
            $(".main > .main-left > .nav > .slide > .active").next(".slide-menu").stop(true).slideUp("fast");
            $(".main > .main-left > .nav > .slide > .menu").removeClass("active");
            if (!ul.is(":visible")) {
                menu.addClass("active");
                ul.addClass("active");
                ul.stop(true).slideDown("fast");
            } else {
                ul.stop(true).slideUp("fast", function () {
                    menu.removeClass("active");
                    ul.removeClass("active");
                });
            }

            return false;
        }

    });

    /**
     * hook menu click and add the hash
     */
    $(".main > .main-left > .nav > .slide > .slide-menu > li > a").click(function () {
        if (lastNode != undefined)
            lastNode.removeClass("active");
        $(this).parent().addClass("active");
        $(".main > .loading").fadeIn("fast");
        return true;
    });

    /**
     * fix menu click
     */
    $(".main > .main-left > .nav > .slide > .slide-menu > li").click(function () {
        if (lastNode != undefined)
            lastNode.removeClass("active");
        $(this).addClass("active");
        $(".main > .loading").fadeIn("fast");
        window.location = $($(this).find("a")[0]).attr("href");
        return false;
    });

    /**
     * fix submenu click
     */
    $("#maincontent > .container > .tabs > li").click(function () {
        $(".main > .loading").fadeIn("fast");
        window.location = $($(this).find("a")[0]).attr("href");
        return false;
    });

    /**
     * get current node and open it
     */
    if (getCurrentNodeByUrl()) {
        mainNodeName = "node-" + luciLocation[0] + "-" + luciLocation[1];
        mainNodeName = mainNodeName.replace(/[ \t\n\r\/]+/g, "_").toLowerCase();
        $("body").addClass(mainNodeName);
    }

    if (mainNodeName != undefined) {
        console.log(mainNodeName);
        switch (mainNodeName) {
            case "node-status-system_log":
            case "node-status-kernel_log":
                $("#syslog").focus(function () {
                    $("#syslog").blur();
                    $(".main-right").focus();
                    $(".main-right").blur();
                });
                break;
            case "node-status-firewall":
                var button = $(".node-status-firewall > .main fieldset li > a");
                button.addClass("cbi-button cbi-button-reset a-to-btn");
                break;
            case "node-system-reboot":
                var button = $(".node-system-reboot > .main > .main-right p > a");
                button.addClass("cbi-button cbi-input-reset a-to-btn");
                break;
        }
    }
