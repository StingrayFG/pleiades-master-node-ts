import { Buffer } from 'node:buffer';

import { describe, expect, test } from '@jest/globals';

import { userConfig } from '../user.config';
import { parseUserRefreshToken } from '../user.parsers';
import {
  createUserApiKeyCredentials,
  createUserRefreshTokenCredentials,
  hashUserApiKeySecret,
  hashUserPassword,
  hashUserRefreshTokenSecret,
  normalizeUserUsername,
  parseUserApiKeyToken,
  verifyUserApiKeySecret,
  verifyUserPassword,
  verifyUserRefreshTokenSecret
} from '../user.processors';

/* fixtures */

const hashKey = Buffer.from('test-hash-key');

/* tests */

describe('user processors', () => {
  test('normalizes usernames to lowercase', () => {
    expect(normalizeUserUsername('Test-User')).toBe('test-user');
  });

  test('hashes and verifies passwords', async () => {
    const passwordHash = await hashUserPassword('correct horse battery staple');

    await expect(verifyUserPassword(passwordHash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyUserPassword(passwordHash, 'wrong password')).resolves.toBe(false);
  });

  test('hashes and verifies API key secrets', () => {
    const secretHash = hashUserApiKeySecret('secret', hashKey);

    expect(verifyUserApiKeySecret(secretHash, 'secret', hashKey)).toBe(true);
    expect(verifyUserApiKeySecret(secretHash, 'wrong', hashKey)).toBe(false);
    expect(verifyUserApiKeySecret('invalid', 'secret', hashKey)).toBe(false);
  });

  test('creates parseable API key credentials with a verifiable secret', () => {
    const credentials = createUserApiKeyCredentials(hashKey);
    const parsed = parseUserApiKeyToken(credentials.token);

    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe(credentials.id);
    expect(verifyUserApiKeySecret(credentials.secretHash, parsed?.secret ?? '', hashKey)).toBe(true);
    expect(credentials.token.startsWith(`${userConfig.apiKey.prefix}.`)).toBe(true);
  });

  test.each([
    '',
    'invalid',
    'wrong.00000000-0000-4000-8000-000000000001.secret',
    `${userConfig.apiKey.prefix}.not-a-uuid.secret`,
    `${userConfig.apiKey.prefix}.00000000-0000-4000-8000-000000000001.`
  ])('rejects malformed API key token %j', (token) => {
    expect(parseUserApiKeyToken(token)).toBeNull();
  });

  test('hashes and verifies refresh-token secrets', () => {
    const secretHash = hashUserRefreshTokenSecret('secret', hashKey);

    expect(verifyUserRefreshTokenSecret(secretHash, 'secret', hashKey)).toBe(true);
    expect(verifyUserRefreshTokenSecret(secretHash, 'wrong', hashKey)).toBe(false);
    expect(verifyUserRefreshTokenSecret('invalid', 'secret', hashKey)).toBe(false);
  });

  test('creates parseable refresh-token credentials with a verifiable secret', () => {
    const credentials = createUserRefreshTokenCredentials(hashKey);
    const parsed = parseUserRefreshToken(credentials.token);

    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe(credentials.id);
    expect(verifyUserRefreshTokenSecret(credentials.secretHash, parsed?.secret ?? '', hashKey)).toBe(true);
    expect(credentials.token.startsWith(`${userConfig.refreshToken.prefix}.`)).toBe(true);
  });

  test.each([
    '',
    'invalid',
    'wrong.00000000-0000-4000-8000-000000000001.secret',
    `${userConfig.refreshToken.prefix}.not-a-uuid.secret`,
    `${userConfig.refreshToken.prefix}.00000000-0000-4000-8000-000000000001.`
  ])('rejects malformed refresh token %j', (token) => {
    expect(parseUserRefreshToken(token)).toBeNull();
  });
});
