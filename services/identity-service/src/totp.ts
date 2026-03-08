import { createHmac, createHash, randomBytes } from "node:crypto";

/**
 * Generate a random 160-bit TOTP secret (hex-encoded).
 */
export function generateSecret(): string {
  return randomBytes(20).toString("hex");
}

/**
 * Generate a 6-digit TOTP code for the given secret and time.
 * Uses HMAC-SHA1 with a 30-second time step (RFC 6238).
 */
export function generateTotpCode(secret: string, time?: number): string {
  const counter = Math.floor((time ?? Date.now() / 1000) / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", Buffer.from(secret, "hex")).update(buffer).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code =
    (((hmac[offset]! & 0x7f) << 24) |
      (hmac[offset + 1]! << 16) |
      (hmac[offset + 2]! << 8) |
      hmac[offset + 3]!) %
    1000000;
  return code.toString().padStart(6, "0");
}

/**
 * Verify a TOTP code against the given secret, allowing for clock drift
 * within the specified window (number of 30-second steps in each direction).
 */
export function verifyTotpCode(secret: string, code: string, window: number = 1): boolean {
  const now = Date.now() / 1000;
  for (let i = -window; i <= window; i++) {
    if (generateTotpCode(secret, now + i * 30) === code) return true;
  }
  return false;
}

/**
 * Convert a hex string to base32 encoding (RFC 4648, no padding).
 */
export function hexToBase32(hex: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = Buffer.from(hex, "hex");
  let bits = "";
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, "0");
  }
  // Pad to multiple of 5
  while (bits.length % 5 !== 0) {
    bits += "0";
  }
  let result = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5);
    result += alphabet[parseInt(chunk, 2)]!;
  }
  return result;
}

/**
 * Generate an otpauth:// URL for TOTP QR code scanning.
 */
export function generateOtpauthUrl(
  secret: string,
  email: string,
  issuer: string = "ScriptManifest"
): string {
  const base32Secret = hexToBase32(secret);
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${base32Secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generate a list of single-use backup codes (8 hex chars each).
 */
export function generateBackupCodes(count: number = 10): string[] {
  return Array.from({ length: count }, () => randomBytes(4).toString("hex"));
}

/**
 * Hash a backup code for storage.
 */
export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}
