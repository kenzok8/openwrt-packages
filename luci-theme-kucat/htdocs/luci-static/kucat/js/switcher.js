/* <![CDATA[ */

function syncToUci(theme) {
    fetch('/cgi-bin/luci/api/set', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'theme=' + encodeURIComponent(theme)
    }).catch(console.error);
}

async function syncgetUci() {
    try {
        const response = await fetch("/cgi-bin/luci/api/get");
        if (!response.ok) throw new Error("Network error");
        return await response.json();
    } catch (error) {
        console.error("Fetch config failed, using default:", error);
        return {
            success: false,
            bgqs: "1",
            primaryrgbm: "45,102,147",
            primaryrgbmts: "0",
            mode: "light"
        };
    }
}
// Theme Detection
function getTimeBasedTheme() {
    const hour = new Date().getHours();
    // console.debug('hour:', hour);
    return (hour < 6 || hour >= 18) ? 'dark' : 'light';
}

// Theme Application
async function updateThemeVariables(theme) {
  const root = document.documentElement;
  const isDark = theme === 'dark';
  try {
    const config = await syncgetUci();
        const primaryRgbbody = isDark ? '33,45,60' : '248,248,248';
        const bgqsValue = config.bgqs || "1"; 
        const rgbmValue = config.primaryrgbm || '45,102,147';
        const rgbmtsValue = config.primaryrgbmts || '0';
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

        if (window.LuciForm) {
            LuciForm.refreshVisibility();
        }
  } catch (error) {
        console.error('Error updating theme variables:', error);
  }
}

document.getElementById('themeToggle').addEventListener('click', function() {
    const switcher = this;
    const isDark = switcher.dataset.theme === 'dark';
    const newTheme = isDark ? 'light' : 'dark';
    
    switcher.dataset.theme = newTheme;
    
    document.querySelectorAll('.theme-switcher span').forEach(span => {
        span.classList.toggle('active');
    });

    document.body.setAttribute('data-theme', newTheme);
    
     // console.debug('switcher:', switcher.dataset.theme,newTheme);
    syncToUci(newTheme);
    updateThemeVariables(newTheme);
});

window.addEventListener('DOMContentLoaded', async function() {

    const config = await syncgetUci();
    
    function applyTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        const meta = document.querySelector('meta[name="theme-color"]');
        const switcher = document.getElementById('themeToggle');
        switcher.dataset.theme = theme;
        if (theme === 'dark') {
        switcher.querySelector('.pdboy-dark').classList.add('active');
        switcher.querySelector('.pdboy-light').classList.remove('active');
    } else {
        switcher.querySelector('.pdboy-light').classList.add('active');
        switcher.querySelector('.pdboy-dark').classList.remove('active');
    }
        if (meta) {
            meta.content = theme === 'dark' ? '#1a1a1a' : '#ffffff';
        }
    }
        const themeToApply = config.mode === 'auto' 
            ? getTimeBasedTheme() 
            : (config.mode || 'light');


    // console.debug('switcher:', config.mode,themeToApply);
    applyTheme(themeToApply);
    await updateThemeVariables(themeToApply);
});

/* ]]> */
