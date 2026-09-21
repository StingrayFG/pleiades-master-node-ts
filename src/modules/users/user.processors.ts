import { Buffer } from 'node:buffer';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

import { userApiKeyIdSchema, type UserApiKeyId, type UserRefreshTokenId, type UserUsername } from './user.domain';
import { userConfig } from './user.config';

/* user processors */

export const normalizeUserUsername = (username: UserUsername): UserUsername => {
  return username.toLowerCase();
};

/* password processors */

export const hashUserPassword = async (password: string): Promise<string> =>
  argon2.hash(password, {
    type: argon2.argon2id
  });

export const verifyUserPassword = async (passwordHash: string, password: string): Promise<boolean> =>
  argon2.verify(passwordHash, password);

/* api key processors */

export const hashUserApiKeySecret = (secret: string, hashKey: Buffer): string =>
  createHmac('sha256', hashKey).update(secret).digest('base64url');

export const verifyUserApiKeySecret = (secretHash: string, secret: string, hashKey: Buffer): boolean => {
  const expectedHash = Buffer.from(secretHash, 'base64url');

  const actualHash = createHmac('sha256', hashKey).update(secret).digest();

  return expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);
};

export const createUserApiKeyCredentials = (
  hashKey: Buffer
): {
  id: string;
  secretHash: string;
  token: string;
} => {
  const id = randomUUID();
  const secret = randomBytes(userConfig.apiKey.secretSizeBytes).toString('base64url');

  return {
    id,
    secretHash: hashUserApiKeySecret(secret, hashKey),
    token: `${userConfig.apiKey.prefix}.${id}.${secret}`
  };
};

export const parseUserApiKeyToken = (
  token: string
): {
  id: UserApiKeyId;
  secret: string;
} | null => {
  const parts = token.split('.');

  if (parts.length !== 3) {
    return null;
  }

  const [prefix, rawId, secret] = parts;

  if (prefix !== userConfig.apiKey.prefix || !secret) {
    return null;
  }

  const idResult = userApiKeyIdSchema.safeParse(rawId);

  if (!idResult.success) {
    return null;
  }

  return {
    id: idResult.data,
    secret
  };
};

/* refresh token processors */

export const hashUserRefreshTokenSecret = (secret: string, hashKey: Buffer): string =>
  createHmac('sha256', hashKey).update(secret).digest('base64url');

export const verifyUserRefreshTokenSecret = (secretHash: string, secret: string, hashKey: Buffer): boolean => {
  const expectedHash = Buffer.from(secretHash, 'base64url');

  const actualHash = createHmac('sha256', hashKey).update(secret).digest();

  return expectedHash.length === actualHash.length && timingSafeEqual(expectedHash, actualHash);
};

export const createUserRefreshTokenCredentials = (
  hashKey: Buffer
): {
  id: UserRefreshTokenId;
  secretHash: string;
  token: string;
} => {
  const id = randomUUID();
  const secret = randomBytes(userConfig.refreshToken.secretSizeBytes).toString('base64url');

  return {
    id,
    secretHash: hashUserRefreshTokenSecret(secret, hashKey),
    token: `${userConfig.refreshToken.prefix}.${id}.${secret}`
  };
};
