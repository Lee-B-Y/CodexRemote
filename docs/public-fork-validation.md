# 公开副本验证记录

验证日期：2026-11-18。验证对象为 `lee/windows-aliyun` 分支的隔离发布副本，基于上游 `bbb5daa` 与主动问答修复提交 `7c96bab`。

| 检查 | 结果 |
| --- | --- |
| `npm run build` | protocol、mobile、server 均成功 |
| `npm run typecheck` | 三个 workspace 均通过 |
| 服务端 Vitest | 16 个测试文件；145 通过，2 跳过 |
| 安卓界面 Vitest | 16 个测试文件；203 通过 |
| Windows 进程归属 Node 测试 | 4 通过 |
| Windows PowerShell 脚本 | 解析检查通过；未执行安装器 |

测试包含 Desktop v13 合成消息、owner 变化、持久去重、项目元数据、Guardian 隐藏、主动问答、旧缓存迁移、Windows 路径及进程 PID 复用。

本次发布没有连接真实 Desktop IPC、手机或 SSH 服务器，没有启动计划任务，也没有重新构建或安装 APK。上述结果不代替新设备上的协议、网络和真机验收。部署时需同时更新 Bridge 与客户端。
