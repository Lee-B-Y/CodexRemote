# Windows 自托管适配版

本分支基于上游 CodexRemote，面向同一 Windows 用户下运行的 Codex Desktop、Bridge 和安卓客户端。源码版本为上游 `bbb5daa` 加本分支适配；Android 版本标识为 `0.3.8-lee.3`。本仓库不包含运行环境的配置、密钥、聊天记录或已签名 APK。

## 适配范围

- 读取 Desktop 的显式项目、项目顺序及会话归属；“最近”显示所有普通会话，包括未设置项目的会话。读取失败时仍显示最近会话，不根据文件夹虚构项目。
- 隐藏辅助 Guardian review 的列表、会话标签和完成通知；保留普通子 agent 与正常审批功能。
- 支持 Windows 盘符及 UNC 路径的新建会话和附件。
- 支持原生和异步主动提问、选项和自由回答、历史问答卡片、旧缓存迁移及持久去重。客户端与 Bridge 需要一起更新。
- 适配 Desktop v13 状态、v2 启动、v4 中断，补齐 `text_elements`。owner 或 IPC 状态不确定时暂停控制，避免辅助 app-server 启动第二份任务。
- Bridge 与独立反向 SSH 隧道使用当前用户登录后的隐藏计划任务；进程归属检查、退避重连和日志轮转与应用源码一起提供。

协议对照版本为 Desktop `26.1111.2228.0`、随附资源 CLI `0.169.0-alpha.11.1`。这些是版本基线，并不表示兼容之后的所有 Desktop 版本。隐藏启动器在检测到 Desktop 版本变化时拒绝启动 Bridge，必须先重新验证。

## 网络结构

```text
Android → HTTPS/WSS 443 → 公网 Nginx → 127.0.0.1:18787
                                         ↓ 独立反向 SSH
                              Windows 127.0.0.1:8787
                                         ↓
                               Bridge → Desktop IPC
                                      → 辅助 app-server
```

Windows 主动建立 SSH 连接，无需本地公网地址或路由器端口映射。`18787` 在 SSH 服务器上只监听回环地址。Bridge 和 Desktop 必须使用同一 Windows 用户；控制 Desktop 会话时该用户应已登录，Desktop 应保持运行。

## 构建与检查

在仓库根目录，使用 Node.js 22+：

```powershell
npm ci
npm run build
npm run typecheck
npm test
node --test deploy/windows/test/process-ownership.test.mjs
```

公开副本的验证使用合成 fixture，不会连接维护者的 Desktop、手机或服务器。验证记录见 [public-fork-validation.md](public-fork-validation.md)。新部署还需独立验证历史读取、向测试会话追加指令、新建会话、主动提问、审批、中断及断网重连。

## Windows 常驻配置

1. 先构建源码，再创建 `deploy/windows/private`，将 `settings.example.json` 复制为其中的 `settings.json`。
2. 用 `npm run token` 生成随机配对令牌，填写 `token`。调整 Node、PowerShell、SSH、`codexHome`、`fileRoots`、域名和 SSH 主机；配置示例中的路径和主机均为占位符。
3. `testedDesktopVersion` 填写经过协议验证的 Desktop 版本。启动器通过当前用户的 `Get-AppxPackage OpenAI.Codex` 查找 `app/resources/codex.exe`，拒绝退回 PATH 中的其他 CLI。
4. 为此用途生成独立 SSH 密钥，私钥保存为 `deploy/windows/private/id_ed25519`。在 SSH 服务器核对主机公钥后，将其保存到同目录的 `known_hosts`。启动器启用严格主机公钥检查。
5. 服务端使用专用隧道账号，限制为反向转发至 `127.0.0.1:18787`，禁用交互终端；Nginx 转发到该回环入口。参照 [公网入口文档](public-reverse-proxy.md) 和 [Nginx 模板](../deploy/nginx/codex-mobile-remote.example.conf)，将模板的上游端口改为 `18787`，并填写自己的域名与证书路径。
6. 在运行 Desktop 的同一普通用户会话中安装计划任务：

```powershell
& .\deploy\windows\install-tasks.ps1
Start-ScheduledTask -TaskName 'CodexRemote-bridge'
Start-ScheduledTask -TaskName 'CodexRemote-tunnel'
```

安装器创建 `CodexRemote-bridge` 和 `CodexRemote-tunnel`，使用交互用户、普通权限和隐藏 WScript 启动器。登录及每分钟触发器会恢复退出的启动器；运行中采用 IgnoreNew，避免重复实例。安装器遇到同名任务会停止，不覆盖已有任务。系统策略禁用 Windows Script Host 时，安装器会报错，不会修改安全策略。

`private/logs` 保存轮转日志；`private/state` 保存去重和同步状态。只在核实执行结果后再处理去重账本，删除状态可能破坏重复提交保护。

安卓在无法建立 WebSocket 时会检查 `/health`，并可选检查入口的 `/edge-health`、`/diagnostics`；未提供可选诊断端点时会显示较粗粒度的诊断，不影响正常连接。不要在可选公网诊断中暴露令牌、文件路径或聊天内容。

## Android 安装包

常规调试构建沿用上游入口：

```powershell
npm run build:android
```

自行签名 release 时，先准备 Android SDK 和兼容的 JDK（此 Windows 适配采用 Gradle 8.14.3，可使用 JDK 21 或 22），设置 `JAVA_HOME`、`ANDROID_HOME`，再设置以下环境变量：

- `CMR_KEYSTORE`：签名文件的绝对路径。
- `CMR_STORE_PASSWORD`：签名文件密码。
- `CMR_KEY_ALIAS`：密钥别名。
- `CMR_KEY_PASSWORD`：密钥密码。

```powershell
npm run android:sync -w @codex-mobile/mobile
Push-Location apps/mobile/android
try { .\gradlew.bat --no-daemon --max-workers=2 assembleRelease } finally { Pop-Location }
```

SDK 路径通过环境或本地、未提交的 `local.properties` 提供。APK 位于 Android 的 `app/build/outputs/apk/release` 下。后续更新必须使用相同签名；签名材料及构建产物不提交到源码仓库。

## 停用

在任务计划程序中结束并禁用上述两个专用任务，随后确认对应的启动器和已验证的专用子进程均已退出。只停止监听端口不等于停止恢复脚本。云端可停用独立 Nginx 站点和专用隧道账号；无需改动其他服务。
