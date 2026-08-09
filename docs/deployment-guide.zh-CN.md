# PetLink 完整部署与使用手册

> 适用版本：PetLink 0.1.0  
> 文档版本：1.0  
> 更新日期：2026-08-09  
> 当前测试服务器：`http://116.62.37.128`

这份手册分为两部分：

- 第 1～5 章面向普通使用者，介绍安装、登录、生成桌宠和串门。
- 第 6 章以后面向服务器管理员，介绍阿里云部署、更新、备份和排障。

公共文档不包含五名用户的真实访问码。管理员应把每个访问码分别发送给对应使用者，不要在群聊或 GitHub 中公开全部访问码。

## 目录

1. [产品与联机规则](#1-产品与联机规则)
2. [朋友快速开始](#2-朋友快速开始)
3. [日常操作与串门](#3-日常操作与串门)
4. [隐私与安全](#4-隐私与安全)
5. [常见问题](#5-常见问题)
6. [服务器要求](#6-服务器要求)
7. [从零部署服务器](#7-从零部署服务器)
8. [更新、备份与恢复](#8-更新备份与恢复)
9. [升级到域名与 HTTPS](#9-升级到域名与-https)
10. [发布验收清单](#10-发布验收清单)

---

## 1. 产品与联机规则

PetLink 是一款供固定五位好友使用的 Windows 联机桌宠程序。每位用户拥有一个持久个人房间和一只桌宠。

### 1.1 当前测试环境

| 项目 | 当前值 | 说明 |
|---|---|---|
| 服务器地址 | `http://116.62.37.128` | 客户端登录页填写此地址 |
| 支持平台 | Windows 10 / 11 x64 | 需要 Microsoft Edge WebView2 |
| 用户与房间 | 5 个固定用户、5 个个人房间 | 每人固定使用一个用户 |
| 同房间人数 | 最多 5 人 | 所有在场者互相可见 |
| 实时通道 | HTTP + WebSocket | 当前测试阶段尚未启用 TLS |
| 服务状态 | 已部署并完成双用户联机测试 | 支持开机自启和异常重启 |

### 1.2 房间与串门规则

- 每个用户拥有自己的房间，例如 `alice` 对应 `room-alice`。
- 用户去好友房间时，自己的桌宠也进入该抽象房间；各客户端直接在电脑桌面更新同一组桌宠，不显示任何房间画面或房间窗口。
- 同一房间中的所有人接收同一份服务器权威状态，包括桌宠集合、动作和相对位置。
- 房主在线且在自己房间时允许好友进入。
- 房主在线但正在外出时，由“允许主人外出时继续接待”开关决定是否准入。
- 房主离线后房间关闭，现有访客会返回各自房间。
- 网络瞬断有约 15 秒重连宽限，避免桌宠立即消失。

### 1.3 同步范围

PetLink 会同步：

- 桌宠所在房间、相对位置、方向和大小；
- `idle`、`move`、`interact`、`sleep` 动作；
- 拖拽、互动和房间准入状态；
- 用户发布的桌宠素材包。

PetLink 不会同步：

- 桌面壁纸、窗口内容或屏幕截图；
- 键盘输入、普通鼠标操作或个人文件；
- 显示器分辨率和真实桌面像素；
- 用户脚本或可执行代码。

---

## 2. 朋友快速开始

### 2.1 准备内容

开始前需要：

1. Windows 10 或 Windows 11 的 64 位电脑；
2. 最新版 PetLink 安装包；
3. 管理员分配的固定用户 ID；
4. 与该用户 ID 配套的访问码；
5. 一张 PNG、JPEG 或 WebP 图片。

透明背景或纯色背景的角色图片生成效果最好。

### 2.2 安装包校验

当前安装包：

| 文件 | SHA-256 |
|---|---|
| `PetLink_0.1.0_x64-setup.exe` | `BA649100835A51A591703B052B6FE016F8ED383738A97DAAE1810223448988D5` |
| `PetLink_0.1.0_x64.msi` | `0EC29139C9D20BE218D03140FEBAC16CFCCABF1E46E2DE65F00AE8FF648FC52D` |

在 PowerShell 中校验：

```powershell
Get-FileHash .\PetLink_0.1.0_x64-setup.exe -Algorithm SHA256
```

如果文件来自群文件或网盘转发，建议先核对哈希值。

### 2.3 安装程序

1. 双击 `PetLink_0.1.0_x64-setup.exe`，也可以使用 MSI 安装包。
2. 按安装向导完成安装。
3. 当前测试版尚未购买 Windows 代码签名证书，系统可能提示发布者未知。请先确认文件来源和 SHA-256。
4. 如果提示缺少 WebView2，请先通过 Windows 更新安装 Microsoft Edge WebView2 Runtime。
5. 启动 PetLink，打开控制中心。

### 2.4 首次登录

| 字段 | 填写内容 |
|---|---|
| 服务器地址 | `http://116.62.37.128` |
| 用户 ID | 管理员分配的小写 ID，例如 `alice` |
| 显示名称 | 房间中显示的昵称，可以使用中文 |
| 访问码 | 仅属于该用户 ID 的访问码 |

登录失败时依次检查：

1. 地址必须以 `http://` 开头，不能写成 `https://`；
2. 用户 ID 使用小写；
3. 访问码没有多余空格；
4. 访问码与用户 ID 配套。

### 2.5 上传图片生成桌宠

1. 在控制中心选择上传图片。
2. 选择 PNG、JPEG 或 WebP 文件。
3. 拖动图片并调整缩放，让角色头部和身体对齐虚线固定骨架。
4. 点击“生成并应用到桌面”。程序在本机进行轻量背景处理并拆分 `root/body/head`，随后立即替换桌宠。
5. 在线时素材会自动同步到服务器，无需单独发布。

建议：

- 使用正面或轻微侧面的完整角色图；
- 让头部与身体边界清晰；
- 避免复杂照片背景、多人合照和大面积文字水印；
- 优先使用透明或单一纯色背景；
- 需要更可控的素材时，可使用项目内的 `create-petlink-pet` Skill。

---

## 3. 日常操作与串门

### 3.1 本地操作

| 操作 | 效果 |
|---|---|
| 鼠标拖拽 | 移动桌宠位置 |
| 双击桌宠 | 触发互动动作 |
| 右键桌宠 | 互动、待机、走动、睡觉或打开设置 |
| 大小设置 | 在允许范围内缩放桌宠 |
| 随机游走 | 桌宠根据状态自动移动和切换动作 |

### 3.2 去好友房间

1. 确认你和目标好友都已在线。
2. 在成员列表中选择目标好友或房间。
3. 发送串门请求。
4. 准入通过后，你和自己的桌宠会一起切换到目标房间。
5. 选择返回自己房间结束串门。

### 3.3 多人同房间

五人可以同时进入同一个在线房间。服务器使用 `[0,1] × [0,1]` 归一化坐标保存位置，再由每台电脑按主显示器尺寸映射。

因此大家看到的是相同的相对布局，不是逐像素相同的桌面。PetLink 不会传输任何人的壁纸或窗口画面。

### 3.4 房主准入状态

| 房主状态 | 是否允许进入 |
|---|---|
| 在线且在自己房间 | 允许 |
| 在线但正在别人房间 | 取决于“外出时继续接待”开关 |
| 断线重连宽限期 | 暂停新准入，等待约 15 秒 |
| 离线 | 不允许；现有访客返回自己的房间 |

---

## 4. 隐私与安全

> [!WARNING]
> 当前测试服务器使用公网 IP + HTTP，登录访问码和联机数据没有 TLS 传输加密。仅限五名可信朋友测试，不要复用其他网站密码，也不要把访问码发布到公开位置。

- 每个用户使用独立访问码，不要多人共用同一个用户。
- 不要把 `PetLink_server_access.txt` 上传到 GitHub、公开网盘或公开群。
- 访问码泄露后应立即联系管理员轮换。
- PEM 是服务器管理私钥，绝不能发送给普通用户。
- 配置域名和 HTTPS 后，应重新生成签名密钥和五个访问码。

---

## 5. 常见问题

### 5.1 无法连接服务器

在浏览器打开：

```text
http://116.62.37.128/health
```

正常结果类似：

```json
{"ok":true,"users":5,"now":1786258235476}
```

如果无法打开，联系管理员检查服务器状态、安全组和网络。

### 5.2 用户或访问码错误

- 用户 ID 必须使用管理员分配的小写值；
- 访问码必须与用户 ID 配套；
- 删除复制时产生的首尾空格；
- 不要把显示名称误填到用户 ID。

### 5.3 无法进入好友房间

检查：

- 房主是否在线；
- 房主是否在重连宽限期；
- 房主外出时是否允许继续接待；
- 自己是否已经进入其他房间。

### 5.4 好友突然被送回房间

通常是房主离线超过约 15 秒。房主重新上线后可以再次串门。

### 5.5 桌宠生成效果不理想

换用透明背景、纯色背景、完整主体且边界清楚的图片重新生成。

### 5.6 不同电脑看到的位置略有差异

这是不同分辨率和 DPI 的相对坐标映射结果，不是同步失败。

### 5.7 动作卡住或不同步

先等待自动重连。如果仍未恢复，退出客户端后重新登录。

---

## 6. 服务器要求

本章以后面向服务器管理员。

### 6.1 当前实例

| 项目 | 当前配置 | 建议长期配置 |
|---|---|---|
| 地域 | 华东 1（杭州） | 选择靠近主要用户的地域 |
| CPU / 内存 | 2 vCPU / 2 GiB | 2 vCPU / 4 GiB 更有余量 |
| 系统盘 | 20 GiB ESSD | 40 GiB ESSD |
| 公网带宽 | 5 Mbps 峰值、按流量 | 5 Mbps 或更高 |
| 系统 | Ubuntu 24.04 64 位 | Ubuntu 24.04 LTS |
| 公网 IP | `116.62.37.128` | 固定公网 IP 或弹性公网 IP |

五人规模不需要 GPU、RDS、Redis、负载均衡或对象存储。

### 6.2 安全组

| 端口 | 来源 | 用途 |
|---|---|---|
| `80/TCP` | `0.0.0.0/0` | 当前 HTTP 和 WebSocket 服务 |
| `22/TCP` | 管理员固定公网 IP `/32` | SSH 运维，不要长期对全网开放 |
| `443/TCP` | `0.0.0.0/0` | 未来 HTTPS/WSS |
| `8787/TCP` | 不开放公网 | PetLink 仅监听本机，由 Nginx 代理 |

---

## 7. 从零部署服务器

以下命令假设：

- Ubuntu 24.04；
- 使用 `root` SSH 登录；
- 项目目录为 `/opt/petlink`；
- 数据目录为 `/var/lib/petlink`。

### 7.1 SSH 登录与 PEM 权限

Windows OpenSSH 会拒绝权限过宽的 PEM。

```powershell
icacls "$env:USERPROFILE\Downloads\PetLink.pem" /inheritance:r
ssh -i "$env:USERPROFILE\Downloads\PetLink.pem" root@116.62.37.128
```

不要转发 PEM，也不要把 PEM 提交到 GitHub。

### 7.2 安装运行环境

```bash
apt-get update
apt-get install -y git nodejs npm nginx

node --version
npm --version
nginx -v
```

Node.js 必须为 18.18 或更高版本。

### 7.3 拉取代码

```bash
git clone https://github.com/XsystemH/PetLink.git /opt/petlink
cd /opt/petlink
git checkout agent/support-ip-deployment
```

> [!NOTE]
> 公网 IP 部署支持当前位于 PR #1。PR 合并到 `main` 后，新部署不再需要执行 `git checkout agent/support-ip-deployment`。

### 7.4 创建环境配置

创建 `/opt/petlink/.env.production`：

```dotenv
NODE_ENV=production
PETLINK_HOST=127.0.0.1
PETLINK_PORT=8787
PETLINK_PUBLIC_URL=http://116.62.37.128
PETLINK_ORIGIN=http://tauri.localhost,https://tauri.localhost
PETLINK_TOKEN_SECRET=<至少32字节的随机值>
PETLINK_USERS=alice:<访问码1>,bob:<访问码2>,carol:<访问码3>,dave:<访问码4>,eve:<访问码5>
PETLINK_DATA_DIR=/var/lib/petlink
```

设置权限：

```bash
chmod 640 /opt/petlink/.env.production
```

不要把真实 `.env.production` 提交到 GitHub。

### 7.5 安装依赖并构建

```bash
cd /opt/petlink
npm ci
npm run build -w @petlink/protocol
npm run build -w @petlink/server
test -f apps/server/dist/index.js
```

### 7.6 创建低权限运行用户

```bash
useradd --system \
  --home-dir /var/lib/petlink \
  --shell /usr/sbin/nologin \
  petlink

install -d -o petlink -g petlink -m 750 /var/lib/petlink
chown root:petlink /opt/petlink/.env.production
```

### 7.7 配置 systemd

创建 `/etc/systemd/system/petlink.service`：

```ini
[Unit]
Description=PetLink room server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=petlink
Group=petlink
WorkingDirectory=/opt/petlink
EnvironmentFile=/opt/petlink/.env.production
ExecStart=/usr/bin/node /opt/petlink/apps/server/dist/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadWritePaths=/var/lib/petlink

[Install]
WantedBy=multi-user.target
```

启动：

```bash
systemctl daemon-reload
systemctl enable --now petlink
systemctl status petlink --no-pager
```

### 7.8 配置 Nginx

创建 `/etc/nginx/sites-available/petlink`：

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 75s;
    }
}
```

启用站点：

```bash
unlink /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/petlink /etc/nginx/sites-enabled/petlink
nginx -t
systemctl restart nginx
```

### 7.9 验证部署

```bash
systemctl is-enabled petlink
systemctl is-active petlink
systemctl is-active nginx

curl -fsS http://127.0.0.1/health
curl -fsS http://116.62.37.128/health
```

预期返回：

```json
{"ok":true,"users":5,"now":1786258235476}
```

随后至少使用两个不同用户验证：

1. 两个用户都能登录；
2. Bob 能进入 Alice 的房间；
3. 两人都看到同一房间中的两只桌宠；
4. Alice 的位置或动作变化能同步给 Bob；
5. WebSocket 断开后客户端能够重新连接。

---

## 8. 更新、备份与恢复

### 8.1 更新程序

```bash
cd /opt/petlink
git fetch origin
git pull --ff-only

npm ci
npm run build -w @petlink/protocol
npm run build -w @petlink/server

systemctl restart petlink
curl -fsS http://127.0.0.1/health
```

更新会短暂中断实时连接。更新前应通知用户并备份数据。

### 8.2 备份

持久数据目录：

```text
/var/lib/petlink
```

创建备份：

```bash
install -d -m 700 /var/backups/petlink
tar -C /var/lib \
  -czf /var/backups/petlink/petlink-$(date +%F-%H%M).tar.gz \
  petlink
```

建议：

- 每天保留一次阿里云快照；
- 每次升级前额外归档；
- 定期在其他位置保留一份备份。

### 8.3 恢复

```bash
systemctl stop petlink

mv /var/lib/petlink /var/lib/petlink.before-restore
mkdir -p /var/lib/petlink
tar -C /var/lib -xzf /var/backups/petlink/<备份文件>.tar.gz
chown -R petlink:petlink /var/lib/petlink

systemctl start petlink
curl -fsS http://127.0.0.1/health
```

确认恢复成功后再删除 `petlink.before-restore`。

### 8.4 轮换访问码

1. 为五个用户分别生成新的随机访问码；
2. 修改 `/opt/petlink/.env.production` 中的 `PETLINK_USERS`；
3. 执行 `systemctl restart petlink`；
4. 分别把新访问码发送给对应用户。

### 8.5 日志与服务控制

```bash
journalctl -u petlink -n 100 --no-pager
journalctl -u petlink -f

systemctl restart petlink
systemctl stop petlink
systemctl start petlink
```

---

## 9. 升级到域名与 HTTPS

当前 HTTP 只适合第一阶段测试。长期使用建议：

1. 准备域名并解析到服务器公网 IP；
2. 中国内地服务器按要求完成 ICP 备案；
3. 开放 `443/TCP`；
4. 使用 Caddy 或 Nginx 配置 HTTPS/WSS；
5. 客户端地址改为 `https://你的域名`；
6. 重新生成 `PETLINK_TOKEN_SECRET` 和五个访问码；
7. 验证 `https://你的域名/health` 和 `wss://你的域名/realtime`。

仓库提供了域名 HTTPS 部署文件：

```text
deploy/docker-compose.yml
deploy/Caddyfile
```

---

## 10. 发布验收清单

- [ ] 健康接口返回 `ok=true`、`users=5`。
- [ ] `petlink` 与 `nginx` 均为 `active`。
- [ ] `petlink` 已设置为开机自启。
- [ ] 服务进程使用低权限 `petlink` 用户，不是 `root`。
- [ ] 安全组只开放所需端口，SSH 限制到管理员来源。
- [ ] 五个用户分别能够登录。
- [ ] 错误访问码会被拒绝。
- [ ] 至少两个用户完成串门并看到同一房间。
- [ ] 移动、动作和相对位置能够实时同步。
- [ ] 房主离线超过宽限期后访客会返回自己的房间。
- [ ] 安装包 SHA-256 与本文一致。
- [ ] 访问码、PEM 和 `.env.production` 未提交到 GitHub。
- [ ] 已完成一次可恢复的数据备份。

---

## 账号分配模板

| 用户 ID | 使用者 | 访问码发送状态 | 备注 |
|---|---|---|---|
| alice |  | 未发送 / 已发送 |  |
| bob |  | 未发送 / 已发送 |  |
| carol |  | 未发送 / 已发送 |  |
| dave |  | 未发送 / 已发送 |  |
| eve |  | 未发送 / 已发送 |  |

不要在公共版本中填写真实访问码。

## 项目入口

- GitHub：<https://github.com/XsystemH/PetLink>
- 公网 IP 部署 PR：<https://github.com/XsystemH/PetLink/pull/1>

反馈问题时请提供 PetLink 版本、Windows 版本、发生时间、操作步骤和错误提示。不要在 Issue 中粘贴访问码、PEM、签名密钥或完整 `.env.production`。
