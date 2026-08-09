import path from "node:path";

export interface ServerConfig {
  host: string;
  port: number;
  publicUrl: string;
  origins: Set<string>;
  tokenSecret: string;
  userIds: string[];
  userAccessCodes: Map<string, string>;
  reconnectGraceMs: number;
  dataDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const entries = (env.PETLINK_USERS ?? "alice:petlink-dev,bob:petlink-dev,carol:petlink-dev,dave:petlink-dev,eve:petlink-dev")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const userAccessCodes = new Map<string, string>();
  for (const entry of entries) {
    const separator = entry.indexOf(":");
    if (separator < 1) throw new Error("PETLINK_USERS entries must use user-id:access-code");
    const userId = entry.slice(0, separator).trim().toLowerCase();
    const accessCode = entry.slice(separator + 1).trim();
    if (!/^[a-z0-9-]{1,32}$/.test(userId) || accessCode.length < 8) {
      throw new Error("Each PETLINK_USERS entry needs a valid user ID and an access code of at least 8 characters");
    }
    userAccessCodes.set(userId, accessCode);
  }
  const userIds = [...userAccessCodes.keys()];

  if (userIds.length < 1 || userIds.length > 5 || new Set(userIds).size !== userIds.length) {
    throw new Error("PETLINK_USER_IDS must contain between one and five unique IDs");
  }

  return {
    host: env.PETLINK_HOST ?? "0.0.0.0",
    port: Number(env.PETLINK_PORT ?? 8787),
    publicUrl: env.PETLINK_PUBLIC_URL ?? "http://127.0.0.1:8787",
    origins: new Set(
      (env.PETLINK_ORIGIN ?? "http://tauri.localhost,https://tauri.localhost,http://localhost:1420,http://127.0.0.1:1420")
        .split(",")
        .map((value) => value.trim()),
    ),
    tokenSecret: env.PETLINK_TOKEN_SECRET ?? "dev-only-secret-change-before-deployment",
    userIds,
    userAccessCodes,
    reconnectGraceMs: Number(env.PETLINK_RECONNECT_GRACE_MS ?? 15_000),
    dataDir: path.resolve(env.PETLINK_DATA_DIR ?? "./data"),
  };
}
