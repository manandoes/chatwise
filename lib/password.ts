// Turning a password into something safe to store, and checking it later.
//
// We never store the password itself (docs/Rules.md §3) — only a scrambled
// version that cannot be turned back into the original. Two people who happen
// to choose the same password still get different stored values, because each
// one is mixed with its own random "salt".
//
// This uses scrypt, which ships inside Node.js itself, so there is no extra
// third-party package to trust here (docs/Rules.md §1).

import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

import "server-only";

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 64;

// Deliberately slow, so that guessing passwords in bulk is expensive.
// N is the work factor — raising it makes every check (and every guess) harder.
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const ALGORITHM = "scrypt";

/** Scrambles a password into the string we store in the database. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await scrypt(
    password.normalize("NFKC"),
    salt,
    KEY_BYTES,
    SCRYPT_OPTIONS,
  );

  return [
    ALGORITHM,
    salt.toString("base64"),
    derivedKey.toString("base64"),
  ].join("$");
}

/**
 * Checks a typed-in password against the stored value.
 * Returns false rather than throwing if the stored value is missing or damaged.
 */
export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (!storedHash) return false;

  const [algorithm, saltPart, keyPart] = storedHash.split("$");
  if (algorithm !== ALGORITHM || !saltPart || !keyPart) return false;

  let salt: Buffer;
  let expectedKey: Buffer;
  try {
    salt = Buffer.from(saltPart, "base64");
    expectedKey = Buffer.from(keyPart, "base64");
  } catch {
    return false;
  }

  if (expectedKey.length !== KEY_BYTES) return false;

  const actualKey = await scrypt(
    password.normalize("NFKC"),
    salt,
    KEY_BYTES,
    SCRYPT_OPTIONS,
  );

  // A plain `===` would return as soon as it hit the first differing character.
  // Timing that reveals how much of a guess was correct, so compare in a way
  // that always takes the same amount of time.
  return timingSafeEqual(actualKey, expectedKey);
}

/**
 * Burns the same amount of time as a real password check.
 *
 * Used when the email address doesn't exist at all. Without this, a wrong email
 * would answer noticeably faster than a wrong password, which is enough to let
 * someone work out which email addresses have accounts here.
 */
export async function fakePasswordCheck(): Promise<void> {
  await scrypt("no-such-account", randomBytes(SALT_BYTES), KEY_BYTES, SCRYPT_OPTIONS);
}
