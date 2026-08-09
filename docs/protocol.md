# PetLink 协议 v1

## HTTP

### `POST /api/session/join`

```json
{
  "userId": "alice",
  "displayName": "Alice",
  "accessCode": "personal-secret"
}
```

返回签名令牌和 WebSocket 地址。服务器一分钟内最多接受同一来源十次登录尝试。

### `GET /api/members`

返回五位成员的在线状态、当前房间和桌宠素材版本。需要 Bearer 令牌。

### `GET /api/rooms/{roomId}`

返回指定房间的权威快照。需要 Bearer 令牌。

### `PATCH /api/rooms/me/access`

修改自己的外出准入和好友拖拽权限。

### `PUT /api/pets/me`

上传 `PetPackage v1` JSON，最大 25 MB HTTP 载荷、20 MB 本地包限制。

### `GET /api/pets/{userId}`

下载指定用户的桌宠包。

## WebSocket

连接：`wss://domain/realtime?token=...`

客户端消息：

```text
SUBSCRIBE
MOVE_TO
SET_ACTION
SET_SCALE
DRAG_BEGIN
DRAG_MOVE
DRAG_END
INTERACT
VISIT_REQUEST
RETURN_HOME
SET_ROOM_ACCESS
PING
```

服务器消息：

```text
WELCOME
ROOM_SNAPSHOT
MEMBERS_CHANGED
VISIT_ACCEPTED
NOTICE
ERROR
PONG
```

所有消息包含 `protocolVersion`、`messageId` 和 `timestamp`。服务器每条连接每秒最多处理 60 条消息，单条消息最大 16 KB。

## 拖拽

拖拽开始时服务器发放三秒软锁。每次 `DRAG_MOVE` 延长锁。主人始终可以拖拽自己的桌宠；好友需要桌宠主人开启 `allowFriendDrag`。

## PetPackage v1

包包含 3–7 根骨骼、2–7 个嵌入图片图层和恰好四个素材动作：`idle`、`move`、`interact`、`sleep`。`dragged` 和 `visiting` 是引擎状态，不要求素材动作。
