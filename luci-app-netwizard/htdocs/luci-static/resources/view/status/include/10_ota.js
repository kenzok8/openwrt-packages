// Copyright 2023-2026 sirpdboy
'use strict';
'require baseclass';
'require rpc';

var callOTACheck = rpc.declare({
    object: 'ota',
    method: 'check'
});

const callUciGet = rpc.declare({
    object: 'uci',
    method: 'get',
    params: ['config', 'section', 'option']
});

return baseclass.extend({
    title: _('Firmware Update'),
    
    load: function() {
        return Promise.resolve({ code: -1 });
    },

    render: function() {
        callUciGet('netwizard', 'default', 'updatacheck')
            .then((res) => {
                const updatacheck = res?.value ?? '0';
                console.log('Update check setting:', updatacheck);
                
                // 只有当配置为1时才检测更新
                if (updatacheck == 1 || updatacheck == '1') {
                    setTimeout(() => {
                        this.checkOTAUpdate();
                    }, 1000);
                }
            })
            .catch((err) => {
                const updatacheck = '0';
            });
        
        return null;
    },
    
    checkOTAUpdate: function() {
        if (window.otaCheckStarted) return;
        window.otaCheckStarted = true;
        
        callOTACheck()
            .then(data => {
                if (data && data.code === 0) {
                    this.addUpdateButton();
                }
            })
            .catch(() => {
            });
    },
    
    addUpdateButton: function() {
        if (document.getElementById('ota-notice')) {
            return;
        }
        
        var flashindicators = document.querySelector('#indicators');
        if (!flashindicators) return;
        
        var notice = document.createElement('div');
        notice.id = 'ota-notice';
        notice.innerHTML = [
            '<div style="color: white;">',
            '    <a href="' + L.url('admin/system/ota') + '" ',
            '       class="cbi-button cbi-button-action"',
            '       style="color: white; background: linear-gradient(135deg, #ff6b6b, #ee5a52);"',
            '       onmouseover="this.style.transform=\'translateY(-2px)\'; this.style.boxShadow=\'0 4px 12px rgba(0,0,0,0.15)\'"',
            '       onmouseout="this.style.transform=\'translateY(0)\'; this.style.boxShadow=\'none\'">',
            '        <i class="icon icon-forward"></i>',
            '        ' + _('Update available!') + '',
            '    </a>',
            '</div>'
        ].join('');
        
        flashindicators.parentNode.insertBefore(notice, flashindicators);
        this.addResponsiveStyle();
    },
    
    addResponsiveStyle: function() {
        if (document.getElementById('ota-responsive-style')) return;
        
        var style = document.createElement('style');
        style.id = 'ota-responsive-style';
        style.textContent = '@media (max-width: 480px) { header>.fill>.container>.flex1>.brand { display: none; } }';
        document.head.appendChild(style);
    }
});
