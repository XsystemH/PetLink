import { createHmac, timingSafeEqual } from "node:crypto";

interface TokenPayload {
  sub: string;
  exp: number;
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function issueToken(userId: string, secret: string, ttlMs = 12 * 60 * 60 * 1000) {
  const encoded = Buffer.from(
    JSON.stringify({ sub: userId, exp: Date.now() + ttlMs } satisfies TokenPayload),
  ).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyToken(token: string | undefined, secret: string): TokenPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const expected = sign(encoded, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number" || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function bearerToken(header: string | undefined) {
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length);
}
