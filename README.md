# PetLink

PetLink 是一款供固定五位好友使用的 Windows 联机桌宠 MVP。每位用户拥有一个抽象的个人房间，桌宠可以进入在线好友的房间；同一房间中的客户端直接在各自电脑桌面显示相同的桌宠集合、相对位置、动作和交互状态。程序没有房间画面，也不传输真实桌面。

## 已实现

- 五个服务器预配置用户，各自一个持久个人房间。
- 房主在家时可访问；房主在线外出时按个人开关决定是否继续准入；离线房间关闭。
- 最多五只桌宠同时出现在同一房间，所有在场用户接收同一权威快照。
- WebSocket 实时同步、15 秒断线重连宽限、房主离线后自动遣返访客。
- 独立用户访问码、短期签名令牌、消息频率与载荷限制。
- Windows 透明置顶桌宠窗口、拖拽、双击互动、动作菜单、大小设置和随机游走；随机行为可设置 3–120 秒的最短/最长等待范围，走动采用较慢的匀速位移。
- 头、躯干、双臂、双腿和可选双耳分别选择 PNG/JPEG/WebP；上传后可在虚线框内拖动、缩放并居中复位，预览与最终裁切使用同一套参数。任一部件也可通过调色盘或屏幕取色器改用纯色，并支持一键恢复初始桌宠。
- 固定九骨骼绑定：`root`、头、躯干、双耳、双臂、双腿；`idle`、`move`、`interact`、`sleep` 都会驱动四肢。
- 自主游走由 Windows 原生宿主调度，设置窗口隐藏后仍会持续运行并经服务器同步。
- 项目内置 `create-petlink-pet` Skill，用于制作更稳定的透明源图。

## 项目结构

```text
petlink/
├─ apps/
│  ├─ desktop/              Tauri 2 设置面板 + Windows 原生桌宠宿主
│  │  ├─ src/               设置、图片对齐生成和联机逻辑
│  │  └─ src-tauri/         WPF 透明桌宠、本机管道和素材存储
│  └─ server/               Node.js HTTP + WebSocket 单服务器
├─ packages/
│  └─ protocol/             客户端/服务器共享协议与 PetPackage v1
├─ skills/
│  └─ create-petlink-pet/   个性化桌宠源图生成 Skill
├─ deploy/                  Docker + Caddy 公网部署
├─ docs/                    架构、协议与部署说明
└─ .github/workflows/       GitHub 持续集成
```

## 本地启动

要求：Node.js 18.18+、Rust 1.87+、Windows 10/11、.NET Framework 4.8 和 WebView2。

```powershell
npm install
Copy-Item .env.example .env
```

在 `.env` 中为五个用户设置不同的访问码，然后启动服务器：

```powershell
Get-Content .env | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') { Set-Item -Path "env:$($matches[1])" -Value $matches[2] }
}
npm run dev:server
```

另开一个终端启动 Windows 客户端：

```powershell
npm run dev:desktop
```

## 验证与打包

```powershell
npm run check
npm test
npm run build
npm run tauri:build -w @petlink/desktop
```

Windows 安装程序会生成在 `apps/desktop/src-tauri/target/release/bundle/`。

## 服务器部署

服务器不需要 GPU、PostgreSQL 或 Redis。五个用户、五个房间的状态和素材保存在一个持久目录中。建议从阿里云 `2 vCPU / 4 GB RAM / 40 GB ESSD / 5 Mbps` 起步，使用 Docker Compose 和 Caddy 提供 HTTPS/WSS。

完整步骤见 [部署说明](docs/deployment.md)。

## 隐私边界

PetLink 只同步桌宠状态，不采集或传输壁纸、窗口、截图、键盘输入、普通鼠标操作或文件。桌宠包只接受声明式 JSON 和嵌入图片，不执行用户脚本。

## 当前范围

- 第一版仅正式支持 Windows 10/11 和主显示器。
- 图片处理使用固定形状的本地中心填充裁切，不做自动抠图或自由骨骼推断；复杂照片可先用项目 Skill 生成八个合规部件素材。
- 暂未加入音效、自由骨骼编辑、自动更新、代码签名和多服务器发现。
- 当前只支持每位用户一只桌宠；协议没有把五人限制写死，后续可扩容。
