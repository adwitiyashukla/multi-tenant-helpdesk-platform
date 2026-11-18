import { hash, verify } from '@node-rs/argon2';

const options = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, options);
}

export async function verifyPassword(digest: string, password: string): Promise<boolean> {
  try {
    return await verify(digest, password, options);
  } catch {
    return false;
  }
}
