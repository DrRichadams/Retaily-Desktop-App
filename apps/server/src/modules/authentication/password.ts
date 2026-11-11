import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");

  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");

  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [algorithm, salt, originalHash] = storedHash.split(":");

    if (algorithm !== "scrypt" || !salt || !originalHash) {
      return false;
    }

    const originalBuffer = Buffer.from(originalHash, "hex");

    if (originalBuffer.length !== KEY_LENGTH) {
      return false;
    }

    const suppliedHash = scryptSync(password, salt, KEY_LENGTH);

    return timingSafeEqual(suppliedHash, originalBuffer);
  } catch {
    return false;
  }
}
