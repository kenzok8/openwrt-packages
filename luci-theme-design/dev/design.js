(function ($) {
  const global = $('head #global-scroll');
  const isMobile = /phone|pad|pod|iPhone|iPod|ios|iOS|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone/i.test(navigator.userAgent);

  function settingGlobalScroll() {
    if (!isMobile && global.length === 0) {
      const style = document.createElement('style');
      style.id = 'global-scroll';
      style.textContent = `::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: var(--scrollbarColor); border-radius: 2px; }`;
      $('head').append(style);
    } else if (isMobile && global.length > 0) {
      global.remove();
    }
  }
  
  document.addEventListener("DOMContentLoaded", function () {
    // Fixed scrollbar styles for browsers on different platforms
    settingGlobalScroll();

    if (self.location.pathname.includes("status/realtime")) {
      const nodeStatusRealtime = $('.node-status-realtime');
      // .node-status-realtime embed[src="/luci-static/resources/bandwidth.svg"] + div + br + table
      // .node-status-realtime embed[src="/luci-static/resources/wifirate.svg"] + div + br + table
      // .node-status-realtime embed[src="/luci-static/resources/wireless.svg"] + div + br + table
      const selectorValues = ['bandwidth', 'wifirate', 'wireless'];
      for (let i = 0; i < selectorValues.length; i++) {
        const value = selectorValues[i];
        const target = nodeStatusRealtime.find(`embed[src="/luci-static/resources/${value}.svg"] + div + br + table`);
        if (target.length) {
          const div = document.createElement('div');
          div.style.overflowX = 'auto';
          target.before(div);
          const newTarget = target.clone();
          target.remove();
          div.appendChild(newTarget[0]);
        }
      }
    }
  });

  // Fixed scrollbar styles for browsers on different platforms
  $(window).resize(() => {
    settingGlobalScroll();
  });
})(jQuery);
