'use strict';
'require view';
'require fs';
'require ui';

return view.extend({
    load: function () {
        return L.resolveDefault(fs.exec_direct('/usr/libexec/wechatpush-call', ['get_client'], 'json'), { devices: [] });
    },
    render: function (data) {

        var devices = data.devices;
        var totalDevices = devices.length;
        var headers = [_('Hostname'), _('IPv4 address'), _('MAC address'), _('Interfaces'), _('Online time'), _('Details')];
        var columns = ['name', 'ip', 'mac', 'interface', 'uptime', 'usage'];
        var visibleColumns = [];
        var hasData = false;

        for (var i = 0; i < columns.length; i++) {
            var column = columns[i];
            var hasColumnData = false;

            for (var j = 0; j < devices.length; j++) {
                if (devices[j][column] !== '') {
                    hasColumnData = true;
                    hasData = true;
                    break;
                }
            }

            if (hasColumnData) {
                visibleColumns.push(i);
            }
        }

        var style = `
            .device-table {
                width: 80%;
                border-collapse: collapse;
            }
            .device-table th,
            .device-table td {
                padding: 0.5rem;
                text-align: center;
                border: 1px solid #ccc;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .device-table td:first-child {
                word-wrap: break-word;
            }
            .device-table th {
                background-color: #f2f2f2;
                font-weight: bold;
                color: #666;
                cursor: pointer;
            }
            .device-table tbody tr:nth-of-type(even) {
                background-color: #f9f9f9;
            }
            .sortable {
                cursor: pointer;
                position: relative;
            }
            .sortable::after {
                content: '';
                position: absolute;
                right: -10px;
                top: 50%;
                transform: translateY(-50%);
                width: 0;
                height: 0;
                border-style: solid;
                border-width: 5px 5px 0 5px;
                border-color: #aaa transparent transparent transparent;
                opacity: 0.6;
            }
            .sortable.asc::after {
                border-color: #666 transparent transparent transparent;
            }
            .sortable.desc::after {
                border-color: transparent transparent #666 transparent;
            }
            .device-table .hide {
                display: none;
            }
            @media (max-width: 767px) {
                .device-table th:nth-of-type(4),
                .device-table td:nth-of-type(4) {
                    display: none;
                }
                .device-table th,
                .device-table td {
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .device-table td:first-child {
                    max-width: 150px;
                }
            }
        `;

        function createTable() {
            var table = document.createElement('table');
            table.classList.add('device-table');

            var thead = document.createElement('thead');
            var tr = document.createElement('tr');

            for (var i = 0; i < headers.length; i++) {
                var th = document.createElement('th');
                th.textContent = headers[i];

                if (visibleColumns.includes(i)) {
                    th.classList.add('sortable');
                    th.dataset.column = columns[i];
                } else {
                    th.classList.add('hide');
                }

                tr.appendChild(th);
            }

            thead.appendChild(tr);
            table.appendChild(thead);

            var tbody = document.createElement('tbody');
            devices.forEach(function (device) {
                var row = document.createElement('tr');
                for (var i = 0; i < columns.length; i++) {
                    if (visibleColumns.includes(i)) {
                        var cell = document.createElement('td');
                        cell.textContent = device[columns[i]];
                        row.appendChild(cell);
                    }
                }
                tbody.appendChild(row);
            });

            table.appendChild(tbody);

            return table;
        }

        var container = document.createElement('div');
        container.appendChild(document.createElement('h2')).textContent = _('当前共 ') + totalDevices + _(' 台设备在线');
        container.appendChild(createTable());
        container.appendChild(document.createElement('style')).textContent = style;

        function sortTable(column) {
            var table = container.querySelector('.device-table');
            var tbody = table.querySelector('tbody');
            var rows = Array.from(tbody.querySelectorAll('tr'));

            var isAscending = true;

            if (table.classList.contains('sorted') && table.dataset.sortColumn === column) {
                isAscending = !table.classList.contains('asc');
            }

            rows.sort(function (row1, row2) {
                var value1 = row1.querySelector('td:nth-of-type(' + (visibleColumns.indexOf(column) + 1) + ')').textContent.toLowerCase();
                var value2 = row2.querySelector('td:nth-of-type(' + (visibleColumns.indexOf(column) + 1) + ')').textContent.toLowerCase();

                if (value1 < value2) {
                    return isAscending ? -1 : 1;
                } else if (value1 > value2) {
                    return isAscending ? 1 : -1;
                }

                return 0;
            });

            tbody.innerHTML = '';

            rows.forEach(function (row) {
                tbody.appendChild(row);
            });

            table.classList.remove('sorted', 'asc', 'desc');
            if (isAscending) {
                table.classList.add('sorted', 'asc');
            } else {
                table.classList.add('sorted', 'desc');
            }
            table.dataset.sortColumn = column;
        }

        container.addEventListener('click', function (event) {
            if (
                event.target.tagName === 'TH' &&
                event.target.parentNode.rowIndex === 0
            ) {
                var columnIndex = event.target.cellIndex;
                var table = container.querySelector('.device-table');
                var tbody = table.querySelector('tbody');
                var rows = Array.from(tbody.querySelectorAll('tr'));

                rows.sort(function (row1, row2) {
                    var value1 = row1.cells[columnIndex].textContent.trim();
                    var value2 = row2.cells[columnIndex].textContent.trim();

                    if (columnIndex === 0) {
                        return value1.length - value2.length;
                    } else if (columnIndex === 1) {
                        value1 = ipToNumber(value1);
                        value2 = ipToNumber(value2);
                    } else if (columnIndex === 4) {
                        value1 = parseOnlineTime(value1);
                        value2 = parseOnlineTime(value2);
                    }

                    if (value1 < value2) {
                        return -1;
                    } else if (value1 > value2) {
                        return 1;
                    }

                    return 0;
                });

                rows.forEach(function (row) {
                    tbody.appendChild(row);
                });
            }
        });

        function ipToNumber(ipAddress) {
            var parts = ipAddress.split('.');
            var number = 0;

            for (var i = 0; i < parts.length; i++) {
                number = number * 256 + parseInt(parts[i]);
            }

            return number;
        }

        function parseOnlineTime(time) {
            var regex = /(\d+)\s+(小时|分钟|秒)/g;
            var matches = time.matchAll(regex);
            var minutes = 0;

            for (var match of matches) {
                var value = parseInt(match[1]);
                var unit = match[2];

                if (unit === '小时') {
                    minutes += value * 60;
                } else if (unit === '分钟') {
                    minutes += value;
                }
            }

            return minutes;
        }
        return container;
    },
    handleSave: null,
    handleSaveApply: null,
    handleReset: null
});
