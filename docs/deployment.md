# 阿里云单服务器部署

## 推荐配置

五个固定用户不需要负载均衡、数据库、Redis 或 GPU。

```text
ECS：2 vCPU / 4 GB RAM
系统盘：40 GB ESSD
公网带宽：5 Mbps
系统：Alibaba Cloud Linux 3 或 Ubuntu 24.04 LTS
端口：22（限制管理 IP）、80、443
数据：独立 Docker volume，每日快照或备份
域名：一个 API 子域名，例如 pet.example.com
```

图片生成发生在客户端，服务器只保存最多五份压缩桌宠素材。正常情况下 2 vCPU / 2 GB 也能运行，4 GB 为系统更新、容器构建和日志保留提供余量。

## 部署

1. 安装 Docker Engine 和 Compose 插件。
2. 把仓库复制到服务器。
3. 在仓库根目录创建 `.env.production`：

```dotenv
PETLINK_DOMAIN=pet.example.com
PETLINK_TOKEN_SECRET=使用至少32字符的随机值
PETLINK_USERS=alice:独立访问码1,bob:独立访问码2,carol:独立访问码3,dave:独立访问码4,eve:独立访问码5
```

4. 启动：

```text
docker compose --env-file .env.production -f deploy/docker-compose.yml up -d --build
```

5. 检查 `https://pet.example.com/health`。
6. 客户端服务器地址填写 `https://pet.example.com`。

## TLS 与备案

Caddy 自动申请和续期 TLS 证书。域名必须提前解析到 ECS 公网 IP。若 ECS 位于中国大陆且域名解析到该实例，需要按服务商和监管要求完成 ICP 备案；若暂时不备案，可先选择阿里云香港等中国大陆以外地域，但内地连接时延和稳定性可能有所不同。

## 安全组

- 443/TCP：允许所有客户端。
- 80/TCP：用于证书申请和 HTTPS 跳转。
- 22/TCP：仅允许你的固定管理 IP。
- 不要把容器的 8787 端口直接暴露到公网。

## 备份和升级

需要备份 Docker volume `petlink-data`。升级前先复制该卷中的 `state.json` 和 `pets/`。服务重启会中断当前动作，但客户端会自动重连，房间结构和素材不会丢失。
