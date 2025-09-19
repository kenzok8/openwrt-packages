/* <![CDATA[ */

async function getUci() {
    try {
        const response = await fetch("/cgi-bin/luci/api/get");
        if (!response.ok) throw new Error("Network error");
        return await response.json();
    } catch (error) {
        console.error("Failed to fetch theme config:", error);
        return {
            success: false,
            bgqs: "0",
            primaryrgbm: "45,102,147",
            primaryrgbmts: "0",
            mode: 'light' 
        };
    }
}
    
function getTimeTheme() {
    const hour = new Date().getHours();
        return (hour < 6 || hour >= 18) ? 'dark' : 'light';
    }

function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

async function updateTheme(theme) {
  const root = document.documentElement;
    const newTheme = theme === 'dark' ? 'dark' : 'light'; 
    const isDark = newTheme === 'dark';
  try {
    const config = await getUci();
    const primaryRgbbody = isDark ? '33,45,60' : '248,248,248';
        const bgqsValue = config.bgqs || "0";
        const rgbmValue = config.primaryrgbm || '45,102,147';
        const rgbmtsValue = config.primaryrgbmts || '0';
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.content = isDark ? '#1a1a1a' : '#ffffff';
        }
        const vars = bgqsValue === "0" ? {
            '--menu-fontcolor': isDark ? '#ddd' : '#f5f5f5',
            '--primary-rgbbody': primaryRgbbody,
            '--bgqs-image': '-webkit-linear-gradient(135deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.1) 50%, rgba(255, 255, 255, 0.1) 75%, transparent 75%, transparent)',
            '--menu-bgcolor': `rgba(${rgbmValue}, ${rgbmtsValue})`,
            '--menu-item-hover-bgcolor': 'rgba(248,248,248, 0.22)',
            '--menu-item-active-bgcolor': 'rgba(248,248,248, 0.3)',
        } : {
            '--menu-fontcolor': isDark ? '#ddd' : '#4d4d5d',
            '--primary-rgbbody': primaryRgbbody,
            '--menu-bgcolor': `rgba(${primaryRgbbody},${rgbmtsValue})`,
        };

        Object.entries(vars).forEach(([key, value]) => {
            root.style.setProperty(key, value);
        });

        if (window.LuciForm) LuciForm.refreshVisibility();
  } catch (error) {
        console.error('Error updating theme variables:', error);
  }
}
(async function(){
    const config = await getUci();
    var initMode = config.mode; 
    var autoTheme; 
    function applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.content = theme === 'dark' ? '#1a1a1a' : '#ffffff';
        }
    }

    (async function() {
        if (initMode === 'auto') {
	    autoTheme = getTimeTheme(); 
        } else {
            autoTheme = initMode;
        } 
            applyTheme(autoTheme);
            await updateTheme(autoTheme);
    })();
})();
/* ]]> */
