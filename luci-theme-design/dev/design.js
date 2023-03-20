(function ($) {

    function settingGlobalScroll() {
        const global = $('head #global-scroll');
        const isMobile = /phone|pad|pod|iPhone|iPod|ios|iOS|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone/i.test(navigator.userAgent);

        if (!isMobile && global.length === 0) {
            const style = document.createElement('style');
            style.type = 'text/css';
            style.id = 'global-scroll';
            style.textContent = '::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: var(--scrollbarColor); border-radius: 2px; }';
            $('head').append(style);
        } else if (isMobile && global.length > 0) {
            global.remove();
        }
    }

    $(document).ready(() => {
        // Fixed scrollbar styles for browsers on different platforms
        settingGlobalScroll();
        // .node-status-realtime embed[src="/luci-static/resources/bandwidth.svg"] + div + br + table
        // .node-status-realtime embed[src="/luci-static/resources/wifirate.svg"] + div + br + table
        // .node-status-realtime embed[src="/luci-static/resources/wireless.svg"] + div + br + table
        if ($('.node-status-realtime').length != 0) {
            const selectorValues = ["bandwidth", "wifirate", "wireless"];
            selectorValues.forEach(value => {
                const target = $(`.node-status-realtime embed[src="/luci-static/resources/${value}.svg"] + div + br + table`);
                if (target.length) {
                    const div = document.createElement("div");
                    div.style.overflowX = "auto";
                    target.before(div);
                    const newTarget = target.clone();
                    target.remove();
                    div.appendChild(newTarget.get(0));
                }
            });
        }

        // Fixed luci-app-passwall menu expand
        if ($(".node-services-passwall").length === 1 && self.location.pathname === "/cgi-bin/luci/admin/services/passwall") {
            var slide = $(".main > .main-left > .nav > .slide");
            slide.each(function () {
                var ul = $(this).children("ul");
                ul.each(function () {
                    var liActive = $(this).children("li.active");
                    liActive.each(function () {
                        var aTags = $(this).children("a");
                        aTags.each(function () {
                            var href = $(this).attr("href");
                            if (href === "/cgi-bin/luci/admin/services/passwall2") {
                                $(this).parent("li").removeClass("active");
                                $(this).closest(".slide").find(".menu").first().click();
                            }
                        });
                    });
                });
            });
        }

    });

    // Fixed scrollbar styles for browsers on different platforms
    $(window).resize(function () {
        settingGlobalScroll();
    });

})(jQuery);
