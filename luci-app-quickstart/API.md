## API
这里列出的接口都是 lua 实现的，对于 POST 请求都是提交表单（ `multipart/form-data` 或者 `application/x-www-form-urlencoded` ），而不是 JSON，并且 POST 请求必须提供 `token` 参数用于防止 CSRF，`token` 的值可以从全局变量 `window.token` 取得。

1. 自动安装配置软件包
    ```
     POST /cgi-bin/luci/admin/nas/quickstart/auto_setup
     token=xxx&packages=aria2&packages=qbittorrent


     {"success":0}
     {"success":1, "scope":"taskd", "error":"task already running"}
    ```
    这是个异步接口，除非任务已经在运行，否则都会成功（success=0）。`packages` 是需要安装配置的软件包列表，与元数据的id对应

2. 获取安装配置结果
    ```
     GET /cgi-bin/luci/admin/nas/quickstart/setup_result


     {"success":0, "result": {"ongoing": true, "packages": ["aria2", "qbittorrent"], "success":["aria2"], "failed":[]} }
     {"success":404, "scope":"taskd", "error":"task not found"}
    ```
    用于在安装过程中或者安装完成时获取当前状态。
    安装过程中或者安装完成时，`success` 都是 0，`result.ongoing` 表示是否在安装过程中，`result.packages` 是提交的任务列表，`result.success` 是已成功的任务列表，`result.failed` 是已失败的任务列表
