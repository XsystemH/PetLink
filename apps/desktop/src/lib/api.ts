import { petPackageSchema, type PetPackage } from "@petlink/protocol";

export interface Session {
  serverUrl: string;
  wsUrl: string;
  token: string;
  userId: string;
  displayName: string;
}

export async function joinSession(
  serverUrl: string,
  userId: string,
  displayName: string,
  accessCode: string,
): Promise<Session> {
  const normalizedServer = serverUrl.replace(/\/$/, "");
  const response = await fetch(`${normalizedServer}/api/session/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, displayName, accessCode }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.message ?? "无法连接服务器"));
  return {
    serverUrl: normalizedServer,
    wsUrl: String(body.wsUrl),
    token: String(body.token),
    userId: String(body.userId),
    displayName: String(body.displayName ?? displayName),
  };
}

export async function fetchPet(session: Session, userId: string): Promise<PetPackage | null> {
  const response = await fetch(`${session.serverUrl}/api/pets/${userId}`, {
    headers: { authorization: `Bearer ${session.token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("无法下载好友的桌宠素材");
  const body = (await response.json()) as { pet: unknown };
  return petPackageSchema.parse(body.pet);
}

export async function uploadPet(session: Session, pet: PetPackage) {
  const response = await fetch(`${session.serverUrl}/api/pets/me`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(pet),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(String(body.message ?? "上传桌宠失败"));
  return Number(body.revision);
}
