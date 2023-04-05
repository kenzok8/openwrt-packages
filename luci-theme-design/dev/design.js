(function ($) {
  const global = $('head #global-scroll');
  const isMobile = /phone|pad|pod|iPhone|iPod|ios|iOS|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone/i.test(navigator.userAgent);

  // Fixed scrollbar styles for browsers on different platforms
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

  // Fixed status realtime table overflow style
  function settingsStatusRealtimeOverflow() {
    if (self.location.pathname.includes("status/realtime")) {
      const nodeStatusRealtime = $('.node-status-realtime');
      const selectorValues = ['bandwidth', 'wifirate', 'wireless'];
      // .node-status-realtime embed[src="/luci-static/resources/bandwidth.svg"] + div + br + table
      // .node-status-realtime embed[src="/luci-static/resources/wifirate.svg"] + div + br + table
      // .node-status-realtime embed[src="/luci-static/resources/wireless.svg"] + div + br + table
      for (let i = 0; i < selectorValues.length; i++) {
        const value = selectorValues[i];
        const target = nodeStatusRealtime.find(`embed[src="/luci-static/resources/${value}.svg"] + div + br + table`);
        if (target.length) {
          target.wrap('<div style="overflow-x: auto;"></div>');
        }
      }
    }
  }

  $(document).ready(() => {
    settingGlobalScroll();
    settingsStatusRealtimeOverflow();
  });

  $(window).on('resize', () => {
    settingGlobalScroll();
  });

  $(window)
})(jQuery);
