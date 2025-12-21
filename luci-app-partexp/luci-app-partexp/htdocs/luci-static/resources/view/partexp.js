/*
 *  Copyright (C) 2022-2025 Sirpdboy <herboy2008@gmail.com>
 *
 *  Licensed to the public under the Apache License 2.0
 */

'use strict';

'require form';
'require fs';
'require rpc';
'require uci';
'require ui';
'require view';

// 声明 RPC 接口
var callPartExpAutopart = rpc.declare({
    object: 'partexp',
    method: 'autopart'
});

var callPartExpGetLog = rpc.declare({
    object: 'partexp',
    method: 'get_log',
    params: ['position']
});

var callPartExpGetDevices = rpc.declare({
    object: 'partexp',
    method: 'get_devices'
});

var callPartExpGetStatus = rpc.declare({
    object: 'partexp',
    method: 'get_status'
});

// 添加保存配置的 RPC 声明
var callPartExpSaveConfig = rpc.declare({
    object: 'partexp',
    method: 'save_config',
    params: ['target_function', 'target_disk', 'keep_config', 'format_type']
});

return view.extend({
    load: function() {
        return Promise.all([
            L.resolveDefault(fs.stat('/usr/bin/partexp'), null),
            L.resolveDefault(fs.stat('/tmp/partexp.log'), null)
        ]);
    },

    render: function(data) {
        var container = E('div', { class: 'cbi-map' });
        var htmlParts = [
            '<style>',
            '.state-ctl .state { display: none !important; }',
            '.state-ctl.state-ctl-ready .state.state-ready,',
            '.state-ctl.state-ctl-executing .state.state-executing {',
            '    display: block !important;',
            '}',
            '.progress-container {',
            '    width: 100%;',
            '    height: 20px;',
            '    background: rgba(0,0,0,0.2);',
            '    border-radius: 10px;',
            '    display: inline-block;',
            '    margin: 10px 0;',
            '    vertical-align: middle;',
            '    position: relative;',
            '    overflow: hidden;',
            '}',
            '.progress-bar {',
            '    height: 100%;',
            '    background: linear-gradient(90deg, #4CAF50, #8BC34A);',
            '    transition: width 0.3s ease-out;',
            '    position: absolute;',
            '    left: 0;',
            '    top: 0;',
            '}',
            '.progress-text {',
            '    position: absolute;',
            '    width: 100%;',
            '    text-align: center;',
            '    line-height: 20px;',
            '    font-size: 12px;',
            '    font-weight: bold;',
            '    color: #eee;',
            '    z-index: 1;',
            '    text-shadow: 1px 1px 2px rgba(0,0,0,0.5);',
            '}',
            '.error-message {',
            '    color: #dc3545;',
            '}',
            '.info-note {',
            '    padding: 10px;',
            '    margin: 10px 0;',
            '    border-radius: 4px;',
            '}',
            '.log-view {',
            '    font-family: "Courier New", monospace;',
            '    font-size: 12px;',
            '    height: 300px;',
            '    overflow-y: auto;',
            '    white-space: pre-wrap;',
            '}',
        '</style>',
        '<h2 name="content">' + _('One click partition expansion mounting tool') + '</h2>',
        '<div class="cbi-section-descr">',
        '    <div class="info-note">',
        '        ' + _('Automatically format and mount the target device partition. If there are multiple partitions, it is recommended to manually delete all partitions before using this tool.') + '<br>',
        '        ' + _('For specific usage, see:') + ' ',
        '        <a href="https://github.com/sirpdboy/luci-app-partexp.git" target="_blank">',
        '            GitHub @partexp',
        '        </a>',
        '    </div>',
            '</div>',
            '<div class="state-ctl state-ctl-ready" id="state-container">',
            '    <div class="cbi-section cbi-section-node">',
            '        <div class="state state-ready">',
            '            <form id="partexp-form">',
            '                <div class="cbi-value">',
            '                    <label class="cbi-value-title" for="target_function">' + _('Select function') + '</label>',
            '                    <div class="cbi-value-field">',
            '                        <select class="cbi-input-select" id="target_function" name="target_function">',
            '                            <option value="/">' + _('Used to extend to the root directory of EXT4 firmware(Ext4 /)') + '</option>',
            '                            <option value="/overlay">' + _('Expand application space overlay (/overlay)') + '</option>',
            '                            <option value="/opt">' + _('Used as Docker data disk (/opt)') + '</option>',
            '                            <option value="/mnt">' + _('Normal mount and use by device name(/mnt/x1)') + '</option>',
            '                        </select>',
            '                        <div class="cbi-value-description">' + _('Select the function to be performed') + '</div>',
            '                    </div>',
            '                </div>',
            '                <div class="cbi-value">',
            '                    <label class="cbi-value-title" for="target_disk">' + _('Destination hard disk') + '</label>',
            '                    <div class="cbi-value-field">',
            '                        <select class="cbi-input-select" id="target_disk" name="target_disk">',
            '                            <option value="">' + _('Loading devices...') + '</option>',
            '                        </select>',
            '                        <div class="cbi-value-description">' + _('Select the hard disk device to operate') + '</div>',
            '                    </div>',
            '                </div>',
            '                <div class="cbi-value">',
            '                    <label class="cbi-value-title" for="keep_config">' + _('Keep configuration') + '</label>',
            '                    <div class="cbi-value-field">',
            '                        <input type="checkbox" class="cbi-input-checkbox" id="keep_config" name="keep_config" value="1" />',
            '                        <label for="keep_config">' + _('Tick means to retain the settings') + '</label>',
            '                    </div>',
            '                </div>',
            '                <div class="cbi-value">',
            '                    <label class="cbi-value-title" for="format_type">' + _('Format system type') + '</label>',
            '                    <div class="cbi-value-field">',
            '                        <select class="cbi-input-select" id="format_type" name="format_type">',
            '                            <option value="0">' + _('No formatting required') + '</option>',
            '                            <option value="ext4">' + _('Linux system partition(EXT4)') + '</option>',
            '                            <option value="btrfs">' + _('Large capacity storage devices(Btrfs)') + '</option>',
            '                            <option value="ntfs">' + _('Windows system partition(NTFS)') + '</option>',
            '                        </select>',
            '                    </div>',
            '                </div>',
            '                <div class="cbi-value cbi-value-last">',
            '                    <label class="cbi-value-title">' + _('Perform operation') + '</label>',
            '                    <div class="cbi-value-field">',
            '                        <button type="button" class="cbi-button cbi-button-apply" id="execute-btn">',
            '                            ' + _('Click to execute') + '',
            '                        </button>',
            '                    </div>',
            '                </div>',
            '            </form>',
            '        </div>',
            '        <div class="state state-executing">',
            '            <div class="cbi-value">',
            '                <label class="cbi-value-title" id="execute_status">' + _('Starting operation...') + '</label>',
            '                <div class="cbi-value-field">',
            '                    <div class="progress-container">',
            '                        <div id="progress-bar" class="progress-bar" style="width: 0%"></div>',
            '                        <div id="progress-text" class="progress-text">0%</div>',
            '                    </div>',
            '                </div>',
            '            </div>',
            '        </div>',
            '    </div>',
            '    <div id="log-section" style="display: block; margin-top: 20px;">',
            '        <div class="cbi-value">',
            '            <label class="cbi-value-title">' + _('Operation Log') + '</label>',
            '            <div class="cbi-value-field">',
            '                <textarea id="log-view" class="log-view" readonly="readonly" rows="15"></textarea>',
            '            </div>',
            '        </div>',
            '    </div>',
            '</div>'
        ];
        container.innerHTML = htmlParts.join('');

        var self = this;
        
        // uci 对象已经在全局作用域可用
        var uci = self.uci || window.uci;
        setTimeout(function() {
            self.initDOM();
            self.bindEvents();
            self.loadDevices();
            self.loadSavedConfig();
            self.checkOperationStatus();
            self.loadExistingLog();
        }, 100);

        return container;
    },

    initDOM: function() {
        this.dom = {
            stateContainer: document.querySelector('#state-container'),
            targetFunction: document.querySelector('#target_function'),
            targetDisk: document.querySelector('#target_disk'),
            keepConfig: document.querySelector('#keep_config'),
            formatType: document.querySelector('#format_type'),
            executeBtn: document.querySelector('#execute-btn'),
            logView: document.querySelector('#log-view'),
            progressBar: document.querySelector('#progress-bar'),
            progressText: document.querySelector('#progress-text'),
            executeStatus: document.querySelector('#execute_status')
        };
        
        // 初始化状态变量
        this.logPosition = '0';
        this.logPolling = null;
        this.isRunning = false;
        this.operationComplete = false;
        this.pollErrorCount = 0;
        this.pollingStartTime = 0;
        this.lastPollTime = 0;
        this.currentProgress = 0;
        this.autoSaveTimer = null;
        this.isNewOperation = false; // 标记是否是新操作
    },

    bindEvents: function() {
        var self = this;
        if (this.dom.executeBtn) {
            this.dom.executeBtn.addEventListener('click', function(e) {
                e.preventDefault();
                self.executeOperation();
            });
        }
        
        // 表单变化事件 - 自动保存
        [this.dom.targetFunction, this.dom.targetDisk, this.dom.formatType].forEach(function(element) {
            if (element) {
                element.addEventListener('change', function() {
                    self.autoSaveConfig();
                    self.updateFormVisibility();
                });
            }
        });
        
        // 复选框特殊处理
        if (this.dom.keepConfig) {
            this.dom.keepConfig.addEventListener('click', function() {
                self.autoSaveConfig();
            });
        }
        
        // 初始化表单可见性
        if (this.dom.targetFunction) {
            this.updateFormVisibility();
        }
    },

    // 加载设备列表
    loadDevices: function() {
        var self = this;
        
        callPartExpGetDevices().then(function(response) {
            if (!response || !response.devices || response.devices.length === 0) {
                return;
            }
            
            // 清空设备列表
            if (self.dom.targetDisk) {
                self.dom.targetDisk.innerHTML = '';
                
                // 添加设备选项
                response.devices.forEach(function(device) {
                    var option = document.createElement('option');
                    option.value = device.name;
                    option.textContent = device.name + ' (' + device.dev + ', ' + device.size + ' MB)';
                    self.dom.targetDisk.appendChild(option);
                });
            }
        }).catch(function(error) {
            console.error('Failed to load devices:', error);
        });
    },

    // 加载现有的日志文件内容
    loadExistingLog: function() {
        var self = this;
        
        // 初始化时获取现有日志内容
        callPartExpGetLog('0').then(function(response) {
            if (response && response.log) {
                var logContent = response.log.toString().trim();
                if (logContent && self.dom.logView) {
                    // 显示现有日志内容
                    self.dom.logView.value = logContent;
                    
                    // 自动滚动到底部
                    setTimeout(function() {
                        if (self.dom.logView && self.dom.logView.value) {
                            self.dom.logView.scrollTop = self.dom.logView.scrollHeight;
                        }
                    }, 100);
                    
                    // 更新日志位置
                    if (response.position) {
                        self.logPosition = response.position;
                    }
                    if (!self.isRunning && logContent.includes('正在执行') && !logContent.includes('操作完成')) {
                        self.isRunning = true;
                        self.switchState('executing');
                        self.startLogPolling();
                    }
                }
            }
        }).catch(function(error) {
            console.error('Failed to load existing log:', error);
        });
    },

    loadSavedConfig: function() {
        var self = this;
        
        return fs.read('/etc/config/partexp').then(function(content) {
            if (!content) {
                self.setDefaultConfig();
                return;
            }
            
            // 解析配置文件
            var lines = content.split('\n');
            var config = {};
            
            lines.forEach(function(line) {
                line = line.trim();
                if (line.startsWith('option')) {
                    var parts = line.split(/\s+/);
                    if (parts.length >= 3) {
                        var key = parts[1];
                        var value = parts.slice(2).join(' ').replace(/^['"]|['"]$/g, '');
                        config[key] = value;
                    }
                }
            });
            
            // 设置表单值
            if (self.dom.targetFunction) {
                self.dom.targetFunction.value = config.target_function || '/opt';
            }
            if (self.dom.targetDisk && config.target_disk) {
                // 等待设备加载完成后设置
                setTimeout(function() {
                    if (self.dom.targetDisk) {
                        self.dom.targetDisk.value = config.target_disk;
                    }
                }, 500);
            }
            if (self.dom.keepConfig) {
                self.dom.keepConfig.checked = (config.keep_config === '1');
            }
            if (self.dom.formatType) {
                self.dom.formatType.value = config.format_type || '0';
            }
            
            // 更新配置缓存
            self.configCache = config;
            
            // 更新表单可见性
            self.updateFormVisibility();
            
        }).catch(function(error) {
            console.log('Failed to load config:', error);
            self.setDefaultConfig();
        });
    },

    // 设置默认配置
    setDefaultConfig: function() {
        if (this.dom.targetFunction) {
            this.dom.targetFunction.value = '/opt';
        }
        if (this.dom.formatType) {
            this.dom.formatType.value = '0';
        }
        if (this.dom.keepConfig) {
            this.dom.keepConfig.checked = false;
        }
        this.updateFormVisibility();
        
        this.configCache = {
            target_function: '/opt',
            target_disk: '',
            keep_config: '0',
            format_type: '0'
        };
    },

    // 自动保存配置（防抖处理）
    autoSaveConfig: function() {
        var self = this;
        
        // 清除之前的定时器
        if (this.autoSaveTimer) {
            clearTimeout(this.autoSaveTimer);
        }
        
        // 设置新的定时器，1.5秒后保存
        this.autoSaveTimer = setTimeout(function() {
            self.saveCurrentConfig();
        }, 1500);
    },

    // 保存当前配置 
    saveCurrentConfig: function() {
        var self = this;
        
        // 获取当前表单值
        var targetFunction = this.dom.targetFunction ? this.dom.targetFunction.value : '/opt';
        var targetDisk = this.dom.targetDisk ? this.dom.targetDisk.value : '';
        var keepConfig = this.dom.keepConfig ? this.dom.keepConfig.checked : false;
        var formatType = this.dom.formatType ? this.dom.formatType.value : '0';
        if (callPartExpSaveConfig) {
            return callPartExpSaveConfig(
                targetFunction,
                targetDisk,
                keepConfig ? '1' : '0',
                formatType
            ).then(function(response) {
                if (response && response.success) {

                    self.configCache = {
                        target_function: targetFunction,
                        target_disk: targetDisk,
                        keep_config: keepConfig ? '1' : '0',
                        format_type: formatType
                    };
                    
                    return true;
                } else {
                    console.warn('RPC save failed, falling back to file write');
                    return self.saveConfigToFile(targetFunction, targetDisk, keepConfig, formatType);
                }
            }).catch(function(error) {
                console.error('RPC save config error:', error);
                return self.saveConfigToFile(targetFunction, targetDisk, keepConfig, formatType);
            });
        } else {
            // 如果 RPC 不可用，直接使用文件写入
            return self.saveConfigToFile(targetFunction, targetDisk, keepConfig, formatType);
        }
    },

    // 备选方案：直接写入配置文件
    saveConfigToFile: function(targetFunction, targetDisk, keepConfig, formatType) {
        var configContent = [
            '# Auto-generated by partexp',
            '',
            'config global global',
            "\toption target_function '" + targetFunction + "'",
            "\toption target_disk '" + targetDisk + "'",
            "\toption keep_config '" + (keepConfig ? '1' : '0') + "'",
            "\toption format_type '" + formatType + "'",
            ''
        ].join('\n');
        
        return fs.write('/etc/config/partexp', configContent).then(function() {
            console.log('Settings saved to file /etc/config/partexp');
            return true;
        }).catch(function(error) {
            console.error('Failed to save settings to file:', error);
            return false;
        });
    },

    // 执行操作
    executeOperation: function() {
        var self = this;
        
        // 先保存配置
        this.saveCurrentConfig();
        var target_function = this.dom.targetFunction.value;
        var target_disk = this.dom.targetDisk.value;
        
        if (target_function !== '/' && (!target_disk || target_disk.trim() === '')) {
            alert(_('Please select a target disk'));
            return;
        }
        
        // 确认操作
        var confirmMessage = _('Are you sure you want to execute partition expansion?') + '\n\n' +
                           _('Function:') + ' ' + this.getFunctionDescription(target_function) + '\n' +
                           (target_function !== '/' ? _('Disk:') + ' ' + target_disk + '\n' : '') +
                           (target_function === '/' || target_function === '/overlay' ? 
                            _('Keep config:') + ' ' + (this.dom.keepConfig.checked ? _('Yes') : _('No')) + '\n' : '') +
                           (target_function === '/opt' || target_function === '/dev' ? 
                            _('Format type:') + ' ' + this.getFormatTypeDescription(this.dom.formatType.value) + '\n' : '') +
                           '\n' + _('This operation may take several minutes.');
        
        if (!confirm(confirmMessage)) {
            return;
        }
        
        // 重置操作状态
        this.resetOperationState();
        
        // 标记为新操作开始
        this.isNewOperation = true;
        
        if (this.dom.logView) {
            this.dom.logView.value = _('正在启动操作...');
        }
        
        // 更新按钮状态
        if (this.dom.executeBtn) {
            this.dom.executeBtn.disabled = true;
            this.dom.executeBtn.textContent = _('Executing...');
        }
        
        // 切换到执行状态
        this.switchState('executing');
        
        // 开始进度显示
        this.updateProgress(5, _('Starting operation...'));
        
        // 调用分区操作
        callPartExpAutopart()
            .then(function(response) {
                if (response && response.success) {
                    // 操作开始成功
                    self.isRunning = true;
                    self.operationComplete = false;
                    self.startLogPolling();
                    
                    if (self.dom.executeStatus) {
                        self.dom.executeStatus.textContent = _('Operation started successfully');
                    }
                } else {
                    // 操作启动失败
                    var errorMsg = response && response.message ? response.message : _('Operation failed');
                    self.handleOperationError(errorMsg);
                }
            })
            .catch(function(error) {
                console.error('Operation failed:', error);
                self.handleOperationError(_('Failed to start operation:') + ' ' + (error.message || _('Unknown error')));
            });
    },

    // 重置操作状态
    resetOperationState: function() {
        this.logPosition = '0';
        this.isRunning = true;
        this.operationComplete = false;
        this.pollErrorCount = 0;
        this.pollingStartTime = Date.now();
        this.lastPollTime = 0;
        this.currentProgress = 0;
        
        // 重置进度条
        this.updateProgress(0, _('Starting operation...'));
    },

    // 处理操作错误
    handleOperationError: function(errorMsg) {
        alert(errorMsg);
        if (this.dom.executeBtn) {
            this.dom.executeBtn.disabled = false;
            this.dom.executeBtn.textContent = _('Click to execute');
        }
        
        this.switchState('ready');
        this.stopLogPolling();
        
        // 在日志中显示错误信息
        if (this.dom.logView) {
            var currentLog = this.dom.logView.value || '';
            this.dom.logView.value = currentLog + '\n\n' + _('操作失败:') + ' ' + errorMsg;
            setTimeout(() => {
                if (this.dom.logView) {
                    this.dom.logView.scrollTop = this.dom.logView.scrollHeight;
                }
            }, 100);
        }
    },

    // 更新表单可见性
    updateFormVisibility: function() {
        if (!this.dom.targetFunction || !this.dom.targetDisk || 
            !this.dom.keepConfig || !this.dom.formatType) return;
        
        var func = this.dom.targetFunction.value;
        var diskDiv = this.dom.targetDisk.closest('.cbi-value');
        var keepDiv = this.dom.keepConfig.closest('.cbi-value');
        var formatDiv = this.dom.formatType.closest('.cbi-value');
        
        if (!diskDiv || !keepDiv || !formatDiv) return;
        
        if (func === '/') {
            diskDiv.style.display = 'none';
            formatDiv.style.display = 'none';
            keepDiv.style.display = 'block';
        } else if (func === '/overlay') {
            diskDiv.style.display = 'block';
            formatDiv.style.display = 'none';
            keepDiv.style.display = 'block';
        } else {
            diskDiv.style.display = 'block';
            formatDiv.style.display = 'block';
            keepDiv.style.display = 'none';
        }
    },

    // 检查操作状态
    checkOperationStatus: function() {
        var self = this;
        
        callPartExpGetStatus().then(function(response) {
            if (response && response.running) {
                // 有操作在进行中
                self.isRunning = true;
                self.switchState('executing');
                self.startLogPolling();
                
                // 禁用执行按钮
                if (self.dom.executeBtn) {
                    self.dom.executeBtn.disabled = true;
                    self.dom.executeBtn.textContent = _('Operation in progress...');
                }
                
                // 更新状态
                if (self.dom.executeStatus) {
                    self.dom.executeStatus.textContent = _('Operation in progress...');
                }
            }
        }).catch(function(error) {
            console.error('Failed to check operation status:', error);
        });
    },

    // 开始轮询日志
    startLogPolling: function() {
        var self = this;
        
        // 停止现有的轮询
        this.stopLogPolling();
        
        // 重置状态
        this.pollErrorCount = 0;
        this.pollingStartTime = Date.now();
        this.lastPollTime = 0;
        
        // 更新进度显示
        this.updateProgress(10, _('Operation in progress...'));
        
        // 开始轮询
        this.logPolling = setInterval(function() {
            // 检查是否超时（20分钟超时）
            if (Date.now() - self.pollingStartTime > 20 * 60 * 1000) {
                console.error('Operation timeout');
                self.stopLogPolling();
                self.isRunning = false;
                
                // 显示超时信息
                if (self.dom.logView) {
                    var currentLog = self.dom.logView.value || '';
                    self.dom.logView.value = currentLog + '\n\n[超时] 操作超过20分钟未完成，请检查系统';
                    setTimeout(() => {
                        if (self.dom.logView) {
                            self.dom.logView.scrollTop = self.dom.logView.scrollHeight;
                        }
                    }, 100);
                }
                
                self.switchState('ready');
                
                if (self.dom.executeBtn) {
                    self.dom.executeBtn.disabled = false;
                    self.dom.executeBtn.textContent = _('Click to execute');
                }
                return;
            }
            
            self.pollLog();
        }, 3000); // 每3秒轮询一次，减少频率
    },

    pollLog: function() {
        var self = this;
        
        if (!this.isRunning) {
            this.stopLogPolling();
            return;
        }
        
        var pollStartTime = Date.now();
        
        // 总是从位置0开始获取完整日志内容
        callPartExpGetLog('0').then(function(response) {
            if (!response) {
                console.error('No response from log polling');
                return;
            }
            
            if (pollStartTime < self.lastPollTime) {
                return;
            }
            
            self.lastPollTime = pollStartTime;
            
            // 处理日志内容
            if (response.log !== undefined) {
                var logContent = response.log.toString().trim();
                
                if (response.position) {
                    self.logPosition = response.position;
                }
                
                if (self.dom.logView) {
                    if (logContent !== '') {
                        self.dom.logView.value = logContent;
                        
                        // 自动滚动到底部
                        setTimeout(function() {
                            if (self.dom.logView && self.dom.logView.value) {
                                self.dom.logView.scrollTop = self.dom.logView.scrollHeight;
                            }
                        }, 50);
                    }
                }
                
                // 更新进度
                self.parseAndUpdateProgress(logContent);
                
                // 检查操作是否完成
                if (self.checkOperationComplete(logContent)) {
                    self.handleOperationComplete();
                }
            }
            
            // 检查RPC返回的完成状态
            if (response.complete) {
                self.handleOperationComplete();
            }
            
            // 重置错误计数
            self.pollErrorCount = 0;
            
        }).catch(function(error) {
            console.error('Log polling error:', error);
            
            // 如果多次失败，停止轮询
            self.pollErrorCount = (self.pollErrorCount || 0) + 1;
            if (self.pollErrorCount > 5) {
                console.error('Too many polling errors, stopping');
                self.stopLogPolling();
                self.isRunning = false;
                self.switchState('ready');
                
                if (self.dom.executeBtn) {
                    self.dom.executeBtn.disabled = false;
                    self.dom.executeBtn.textContent = _('Click to execute');
                }
                // 显示错误信息
                if (self.dom.logView) {
                    var currentLog = self.dom.logView.value || '';
                    self.dom.logView.value = currentLog + '\n\n[错误] 日志轮询失败，请刷新页面查看最新状态';
                    setTimeout(() => {
                        if (self.dom.logView) {
                            self.dom.logView.scrollTop = self.dom.logView.scrollHeight;
                        }
                    }, 100);
                }
            }
        });
    },

    // 检查操作是否完成
    checkOperationComplete: function(logText) {
        if (!logText) return false;
        
        // 检查日志中是否包含操作完成标记
        var completeMarkers = [
            '重启设备',
            '操作完成'
        ];
        
        for (var i = 0; i < completeMarkers.length; i++) {
            if (logText.includes(completeMarkers[i])) {
                return true;
            }
        }
        
        return false;
    },

    // 处理操作完成
    handleOperationComplete: function() {
        if (this.operationComplete) {
            return;
        }
        
        this.operationComplete = true;
        this.isRunning = false;
        this.isNewOperation = false;
        
        // 立即停止轮询
        this.stopLogPolling();
        if (this.dom.logView) {
            var currentLog = this.dom.logView.value || '';
            if (!currentLog.includes('操作完成')) {
                this.dom.logView.value = currentLog;
                setTimeout(() => {
                    if (this.dom.logView) {
                        this.dom.logView.scrollTop = this.dom.logView.scrollHeight;
                    }
                }, 100);
            }
        }
        
        // 进度条显示100%
        this.updateProgress(100, _('Operation completed'));
        
        // 启用执行按钮
        setTimeout(() => {
            if (this.dom.executeBtn) {
                this.dom.executeBtn.disabled = false;
                this.dom.executeBtn.textContent = _('Click to execute');
            }
            
            // 切换回就绪状态
            setTimeout(() => {
                this.switchState('ready');
            }, 3000);
        }, 2000);
    },

    // 解析并更新进度
    parseAndUpdateProgress: function(logText) {
        if (!logText || !this.dom.executeStatus) return;
        
        // 尝试从日志中提取进度信息
        var percent = 0;
        var statusMessage = _('Operation in progress...');
        
        if (logText.includes('100%') || logText.includes('操作完成') || logText.includes('扩容成功')) {
            percent = 100;
            statusMessage = _('Operation completed');
        } else if ( logText.includes('错误') || logText.includes('error')) {
            // 错误情况，不更新进度
            return;
        } else if (logText.includes('分区扩容和挂载到') || logText.includes('正在挂载')) {
            percent = 90;
            statusMessage = _('Getting device information');
        } else if (logText.includes('检测设备')) {
            percent = 60;
            statusMessage = _('Checking partition format');
        } else if (logText.includes('开始检测目标')) {
            percent = 50;
            statusMessage = _('Checking target device');
        } else if (logText.includes('定位到操作目标设备分区')) {
            percent = 40;
            statusMessage = _('Locating target partition');
        } else if (logText.includes('目标盘') && logText.includes('有剩余空间')) {
            percent = 30;
            statusMessage = _('Checking free space');
        } else if (logText.includes('操作功能')) {
            percent = 20;
            statusMessage = _('Starting operation');
        } else if (logText.includes('开始执行') || logText.includes('Starting')) {
            percent = 10;
            statusMessage = _('Initializing...');
        }
        
        // 确保进度不会倒退
        if (percent > 0) {
            this.currentProgress = Math.max(this.currentProgress || 0, percent);
        } else {
            // 如果没有明确的进度标记，逐渐增加进度
            this.currentProgress = Math.min(90, (this.currentProgress || 0) + 1);
        }
        
        // 更新进度显示
        this.updateProgress(this.currentProgress, statusMessage);
    },

    // 更新进度显示
    updateProgress: function(percent, message) {
        if (!this.dom.progressBar || !this.dom.progressText || !this.dom.executeStatus) {
            return;
        }
        
        // 确保百分比在有效范围内
        percent = Math.max(0, Math.min(100, percent));
        
        // 更新进度条
        this.dom.progressBar.style.width = percent + '%';
        
        // 更新进度文本
        this.dom.progressText.textContent = percent + '%';
        
        // 更新状态消息
        this.dom.executeStatus.textContent = message;
    },

    // 停止轮询日志
    stopLogPolling: function() {
        if (this.logPolling) {
            clearInterval(this.logPolling);
            this.logPolling = null;
        }
    },

    // 切换状态
    switchState: function(to) {
        if (!this.dom.stateContainer) return;
        
        // 移除所有状态类
        this.dom.stateContainer.classList.remove(
            'state-ctl-ready',
            'state-ctl-executing'
        );
        
        // 添加新状态类
        this.dom.stateContainer.classList.add('state-ctl-' + to);
    },

    // 获取功能描述
    getFunctionDescription: function(func) {
        switch(func) {
            case '/': return _('Extend to root directory');
            case '/overlay': return _('Expand overlay');
            case '/opt': return _('Docker data disk');
            case '/dev': return _('Normal mount');
            default: return func;
        }
    },

    // 获取格式化类型描述
    getFormatTypeDescription: function(type) {
        switch(type) {
            case '0': return _('No formatting');
            case 'ext4': return _('EXT4');
            case 'btrfs': return _('Btrfs');
            case 'ntfs': return _('NTFS');
            default: return type;
        }
    },

    // 页面生命周期方法
    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});