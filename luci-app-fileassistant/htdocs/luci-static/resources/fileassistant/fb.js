(function () {
  'use strict';

  function escapeHtml(str) {
    if (str === null || str === undefined) {
      return '';
    }
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  var iwxhr = new XHR();
  var listElem = document.getElementById("list-content");
  listElem.onclick = handleClick;
  var currentPath;
  var pathElem = document.getElementById("current-path");

  pathElem.onblur = function () {
    var newPath = this.value.trim();
    if (newPath && newPath !== currentPath) {
      update_list(newPath);
    }
  };

  pathElem.onkeyup = function (evt) {
    if (evt.keyCode === 13) {
      this.blur();
    }
  };

  function removePath(filename, isdir) {
    var msg = isdir === "1" ? '你确定要删除目录 ' : '你确定要删除文件 ';
    if (confirm(msg + escapeHtml(filename) + ' 吗？')) {
      iwxhr.get('/cgi-bin/luci/admin/nas/fileassistant/delete', {
          path: concatPath(currentPath, filename),
          isdir: isdir
        },
        function (x, res) {
          if (res.ec === 0) {
            refresh_list(res.data, currentPath);
          } else {
            alert('删除失败: ' + (res.error || '未知错误'));
          }
        }
      );
    }
  }

  function installPath(filename, isdir) {
    if (isdir === "1") {
      alert('这是一个目录，请选择 ipk 文件进行安装！');
      return;
    }
    if (!isIPK(filename)) {
      alert('只允许安装 ipk 格式的文件！');
      return;
    }
    if (confirm('你确定要安装 ' + escapeHtml(filename) + ' 吗？')) {
      iwxhr.get('/cgi-bin/luci/admin/nas/fileassistant/install', {
          filepath: concatPath(currentPath, filename),
          isdir: isdir
        },
        function (x, res) {
          if (res.ec === 0) {
            alert('安装成功!');
            location.reload();
          } else {
            alert('安装失败: ' + (res.error || '请检查文件格式'));
          }
        }
      );
    }
  }

  function isIPK(filename) {
    var ext = filename.slice(filename.lastIndexOf(".") + 1);
    return ext.toLowerCase() === 'ipk' ? 1 : 0;
  }

  function renamePath(filename) {
    var newname = prompt('请输入新的文件名：', filename);
    if (newname) {
      newname = newname.trim();
      if (newname && newname !== filename) {
        if (!/^[\w\-.\s]+$/.test(newname)) {
          alert('文件名包含非法字符');
          return;
        }
        var newpath = concatPath(currentPath, newname);
        iwxhr.get('/cgi-bin/luci/admin/nas/fileassistant/rename', {
            filepath: concatPath(currentPath, filename),
            newpath: newpath
          },
          function (x, res) {
            if (res.ec === 0) {
              refresh_list(res.data, currentPath);
            } else {
              alert('重命名失败: ' + (res.error || '未知错误'));
            }
          }
        );
      }
    }
  }

  function openpath(filename, dirname) {
    dirname = dirname || currentPath;
    window.open('/cgi-bin/luci/admin/nas/fileassistant/open?path='
      + encodeURIComponent(dirname) + '&filename='
      + encodeURIComponent(filename));
  }

  function getFileElem(elem) {
    if (!elem) {
      return null;
    }
    if (elem.className && elem.className.indexOf('-icon') > -1) {
      return elem;
    }
    if (elem.parentNode && elem.parentNode.className && elem.parentNode.className.indexOf('-icon') > -1) {
      return elem.parentNode;
    }
    return null;
  }

  function concatPath(path, filename) {
    if (path === '/') {
      return path + filename;
    }
    return path.replace(/\/$/, '') + '/' + filename;
  }

  function handleClick(evt) {
    var targetElem = evt.target;
    if (!targetElem) {
      return;
    }
    var targetClass = targetElem.className || '';
    var infoElem;

    if (targetClass.indexOf('cbi-button-remove') > -1) {
      infoElem = targetElem.closest('tr');
      if (infoElem) {
        removePath(infoElem.dataset.filename, infoElem.dataset.isdir);
      }
    } else if (targetClass.indexOf('cbi-button-install') > -1) {
      infoElem = targetElem.closest('tr');
      if (infoElem) {
        installPath(infoElem.dataset.filename, infoElem.dataset.isdir);
      }
    } else if (targetClass.indexOf('cbi-button-edit') > -1) {
      infoElem = targetElem.closest('tr');
      if (infoElem) {
        renamePath(infoElem.dataset.filename);
      }
    } else {
      var fileElem = getFileElem(targetElem);
      if (fileElem) {
        var fileClass = fileElem.className || '';
        var row = fileElem.closest('tr');
        if (fileClass.indexOf('parent-icon') > -1) {
          update_list(currentPath.replace(/\/[^/]+(\/|$)/, ''));
        } else if (fileClass.indexOf('file-icon') > -1 && row) {
          openpath(row.dataset.filename);
        } else if (fileClass.indexOf('link-icon') > -1) {
          if (row && row.dataset.linktarget) {
            if (row.dataset.isdir === "1") {
              update_list(row.dataset.linktarget);
            } else {
              var target = row.dataset.linktarget;
              var lastSlash = target.lastIndexOf('/');
              openpath(target.substring(lastSlash + 1), target.substring(0, lastSlash || 1));
            }
          }
        } else if (fileClass.indexOf('folder-icon') > -1 && row) {
          update_list(concatPath(currentPath, row.dataset.filename));
        }
      }
    }
  }

  function refresh_list(filenames, path) {
    var listHtml = '<table class="cbi-section-table"><tbody>';
    if (path !== '/') {
      listHtml += '<tr class="cbi-section-table-row cbi-rowstyle-2"><td class="parent-icon" colspan="6"><strong>..</strong></td></tr>';
    }
    if (filenames && filenames.length) {
      for (var i = 0; i < filenames.length; i++) {
        var line = filenames[i];
        if (line) {
          var f = line.match(/^([drwl-][r-][w-][x-][r-][w-][x-][r-][w-][x-])\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+\s+\d+\s+\d+:\d+)\s+(.+)$/);
          if (!f) {
            continue;
          }
          var perm = f[1];
          var owner = f[3];
          var size = f[5];
          var date = f[6];
          var name = f[7];
          var isLink = perm[0] === 'l' || perm[0] === 'z' || perm[0] === 'x';
          var displayname = name;
          var filename = name;
          var linktarget = '';
          if (isLink && name.indexOf(' -> ') > -1) {
            var parts = name.split(' -> ');
            displayname = parts[0] + ' -> ' + escapeHtml(parts[1]);
            filename = parts[0];
            linktarget = parts[1];
          } else {
            displayname = escapeHtml(name);
          }
          var icon = (perm[0] === 'd') ? 'folder-icon' : (isLink ? 'link-icon' : 'file-icon');
          var installBtn = '';
          if (filename.slice(filename.lastIndexOf('.') + 1).toLowerCase() === 'ipk') {
            installBtn = '<button class="cbi-button cbi-button-add">安装</button>';
          }
          listHtml += '<tr class="cbi-section-table-row cbi-rowstyle-' + (1 + i % 2) + '"'
            + ' data-filename="' + escapeHtml(filename) + '"'
            + ' data-isdir="' + (perm[0] === 'd' ? 1 : 0) + '"'
            + (linktarget ? ' data-linktarget="' + escapeHtml(linktarget) + '"' : '')
            + '>'
            + '<td class="cbi-value-field ' + icon + '"><strong>' + displayname + '</strong></td>'
            + '<td class="cbi-value-field cbi-value-owner">' + escapeHtml(owner) + '</td>'
            + '<td class="cbi-value-field cbi-value-date">' + escapeHtml(date) + '</td>'
            + '<td class="cbi-value-field cbi-value-size">' + escapeHtml(size) + '</td>'
            + '<td class="cbi-value-field cbi-value-perm">' + escapeHtml(perm) + '</td>'
            + '<td class="cbi-section-table-cell">'
            + '<button class="cbi-button cbi-button-edit">重命名</button>'
            + '<button class="cbi-button cbi-button-remove">删除</button>'
            + installBtn
            + '</td>'
            + '</tr>';
        }
      }
    }
    listHtml += '</tbody></table>';
    listElem.innerHTML = listHtml;
  }

  function update_list(path, opt) {
    opt = opt || {};
    path = concatPath(path, '');
    if (currentPath !== path) {
      iwxhr.get('/cgi-bin/luci/admin/nas/fileassistant/list', {
          path: path
        },
        function (x, res) {
          if (res.ec === 0) {
            refresh_list(res.data, path);
          } else {
            refresh_list([], path);
            if (res.error) {
              console.error('Error:', res.error);
            }
          }
        }
      );
      if (!opt.popState) {
        history.pushState({path: path}, null, '?path=' + encodeURIComponent(path));
      }
      currentPath = path;
      pathElem.value = currentPath;
    }
  }

  var uploadToggle = document.getElementById('upload-toggle');
  var uploadContainer = document.getElementById('upload-container');
  var isUploadHide = true;

  if (uploadToggle && uploadContainer) {
    uploadToggle.onclick = function () {
      isUploadHide = !isUploadHide;
      uploadContainer.style.display = isUploadHide ? 'none' : 'inline-flex';
    };
  }

  var uploadBtn = uploadContainer ? uploadContainer.querySelector('.cbi-input-apply') : null;
  if (uploadBtn) {
    uploadBtn.onclick = function (evt) {
      evt.preventDefault();
      var uploadInput = document.getElementById('upload-file');
      if (!uploadInput || !uploadInput.files || !uploadInput.files[0]) {
        alert('请选择要上传的文件');
        return;
      }
      var file = uploadInput.files[0];
      var formData = new FormData();
      var filename = file.name;
      var lastSlash = Math.max(filename.lastIndexOf('\\'), filename.lastIndexOf('/'));
      if (lastSlash >= 0) {
        filename = filename.substring(lastSlash + 1);
      }
      formData.append('upload-filename', filename);
      formData.append('upload-dir', concatPath(currentPath, ''));
      formData.append('upload-file', file);

      var xhr = new XMLHttpRequest();
      xhr.open('POST', '/cgi-bin/luci/admin/nas/fileassistant/upload', true);

      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          // Upload progress tracking
        }
      };

      xhr.onload = function () {
        if (xhr.status === 200) {
          try {
            var res = JSON.parse(xhr.responseText);
            if (res.ec === 0) {
              refresh_list(res.data, currentPath);
              uploadInput.value = '';
              alert('上传成功!');
            } else {
              alert('上传失败: ' + (res.error || '未知错误'));
            }
          } catch (e) {
            alert('上传失败: 响应解析错误');
          }
        } else {
          alert('上传失败，请稍后再试...');
        }
      };

      xhr.onerror = function () {
        alert('上传失败，请检查网络连接');
      };

      xhr.send(formData);
    };
  }

  function init() {
    var initPath = '/';
    var match = location.search.match(/path=([^&]+)/);
    if (match && match[1]) {
      try {
        initPath = decodeURIComponent(match[1]);
      } catch (e) {
        initPath = '/';
      }
    }
    update_list(initPath, {popState: true});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('popstate', function (evt) {
    var path = '/';
    if (evt.state && evt.state.path) {
      path = evt.state.path;
    }
    update_list(path, {popState: true});
  });

})();
