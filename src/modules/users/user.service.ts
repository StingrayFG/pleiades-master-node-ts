import type { Buffer } from 'node:buffer';

import { GenericForbiddenError, GenericUnauthorizedError } from '@/errors/application.errors';

import type {
  CreateUserInput,
  CreateUserRepositoryInput,
  CreateUserApiKeyInput,
  CreateApiKeyResult,
  CreateUserApiKeyRepositoryInput,
  AuthenticatePasswordInput,
  ApiKeyAuthenticationPrincipal,
  RefreshAuthenticationResult,
  RevokeUserApiKeyInput,
  RevokeUserApiKeyRepositoryInput
} from './user.application';
import type { User, UserApiKey, UserId, UserRefreshToken } from './user.domain';
import {
  createUserApiKeyCredentials,
  createUserRefreshTokenCredentials,
  hashUserPassword,
  parseUserApiKeyToken,
  verifyUserApiKeySecret,
  verifyUserPassword,
  verifyUserRefreshTokenSecret
} from './user.processors';
import type { UserRepositoryContract } from './user.repository';
import { userConfig } from './user.config';
import { parseUserRefreshToken } from './user.parsers';

/* contract */

type UserServiceContract = {
  listApiKeys(userId: UserId): Promise<UserApiKey[]>;
  createUser(input: CreateUserInput): Promise<User>;
  createApiKey(input: CreateUserApiKeyInput): Promise<CreateApiKeyResult>;
  createRefreshToken(userId: UserId): Promise<string>;
  authenticatePassword(input: AuthenticatePasswordInput): Promise<User>;
  authenticateApiKey(token: string): Promise<ApiKeyAuthenticationPrincipal>;
  refreshAuthentication(refreshToken: string): Promise<RefreshAuthenticationResult>;
  revokeApiKey(input: RevokeUserApiKeyInput): Promise<UserApiKey>;
  revokeRefreshToken(refreshToken: string): Promise<UserRefreshToken>;
};

/* service */

class UserService implements UserServiceContract {
  constructor(
    private readonly repository: UserRepositoryContract,
    private readonly apiKeyHashKey: Buffer,
    private readonly refreshTokenHashKey: Buffer
  ) {}

  async listApiKeys(userId: UserId): Promise<UserApiKey[]> {
    return this.repository.listApiKeys(userId);
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const username = input.username.toLowerCase();

    const passwordHash = await hashUserPassword(input.password);

    const createUserRepositoryInput: CreateUserRepositoryInput = {
      username,
      passwordHash
    };

    return this.repository.create(createUserRepositoryInput);
  }

  async createApiKey(input: CreateUserApiKeyInput): Promise<CreateApiKeyResult> {
    const apiKeyCredentials = createUserApiKeyCredentials(this.apiKeyHashKey);

    const createApiKeyRepositoryInput: CreateUserApiKeyRepositoryInput = {
      id: apiKeyCredentials.id,

      userId: input.userId,

      secretHash: apiKeyCredentials.secretHash,

      name: input.name,

      expiresAt: input.expiresAt
    };

    const apiKey = await this.repository.createApiKey(createApiKeyRepositoryInput);

    return {
      apiKey,
      token: apiKeyCredentials.token
    };
  }

  async createRefreshToken(userId: UserId): Promise<string> {
    const credentials = createUserRefreshTokenCredentials(this.refreshTokenHashKey);

    await this.repository.createRefreshToken({
      id: credentials.id,

      userId,

      secretHash: credentials.secretHash,

      expiresAt: new Date(Date.now() + userConfig.refreshToken.ttlMs)
    });

    return credentials.token;
  }

  async authenticatePassword(input: AuthenticatePasswordInput): Promise<User> {
    const username = input.username.toLowerCase();

    const authentication = await this.repository.findAuthenticationByUsername(username);

    if (!authentication || !(await verifyUserPassword(authentication.passwordHash, input.password))) {
      throw new GenericUnauthorizedError('Invalid credentials');
    }

    if (authentication.user.state !== 'active') {
      throw new GenericForbiddenError('User is not active');
    }

    return authentication.user;
  }

  async authenticateApiKey(token: string): Promise<ApiKeyAuthenticationPrincipal> {
    const parsedApiKeyToken = parseUserApiKeyToken(token);

    if (!parsedApiKeyToken) {
      throw new GenericUnauthorizedError('Invalid credentials');
    }

    const authentication = await this.repository.findApiKeyAuthenticationById(parsedApiKeyToken.id);

    if (
      !authentication ||
      !verifyUserApiKeySecret(authentication.secretHash, parsedApiKeyToken.secret, this.apiKeyHashKey)
    ) {
      throw new GenericUnauthorizedError('Invalid credentials');
    }

    const { apiKey, user } = authentication;

    if (
      apiKey.state !== 'active' ||
      apiKey.revokedAt !== null ||
      (apiKey.expiresAt !== null && apiKey.expiresAt <= new Date())
    ) {
      throw new GenericUnauthorizedError('Invalid credentials');
    }

    if (user.state !== 'active') {
      throw new GenericForbiddenError('User is not active');
    }

    return {
      userId: user.id,

      apiKeyId: apiKey.id
    };
  }

  async refreshAuthentication(refreshToken: string): Promise<RefreshAuthenticationResult> {
    const parsedToken = parseUserRefreshToken(refreshToken);

    if (!parsedToken) {
      throw new GenericUnauthorizedError('Invalid refresh token');
    }

    const authentication = await this.repository.findRefreshTokenAuthenticationById(parsedToken.id);

    if (!authentication) {
      throw new GenericUnauthorizedError('Invalid refresh token');
    }

    const validSecret = verifyUserRefreshTokenSecret(
      authentication.secretHash,

      parsedToken.secret,

      this.refreshTokenHashKey
    );

    if (!validSecret) {
      throw new GenericUnauthorizedError('Invalid refresh token');
    }

    const { refreshToken: storedRefreshToken, user } = authentication;

    if (
      storedRefreshToken.state !== 'active' ||
      storedRefreshToken.revokedAt !== null ||
      storedRefreshToken.expiresAt <= new Date()
    ) {
      throw new GenericUnauthorizedError('Invalid refresh token');
    }

    if (user.state !== 'active') {
      throw new GenericForbiddenError('User is not active');
    }

    const credentials = createUserRefreshTokenCredentials(this.refreshTokenHashKey);

    const rotated = await this.repository.rotateRefreshToken({
      currentRefreshTokenId: storedRefreshToken.id,

      newRefreshTokenId: credentials.id,

      userId: user.id,

      secretHash: credentials.secretHash,

      expiresAt: new Date(Date.now() + userConfig.refreshToken.ttlMs)
    });

    if (!rotated) {
      throw new GenericUnauthorizedError('Invalid refresh token');
    }

    return {
      userId: user.id,

      refreshToken: credentials.token
    };
  }

  async revokeApiKey(input: RevokeUserApiKeyInput): Promise<UserApiKey> {
    const revokeApiKeyRepositoryInput: RevokeUserApiKeyRepositoryInput = {
      userId: input.userId,

      apiKeyId: input.apiKeyId
    };

    return this.repository.revokeApiKey(revokeApiKeyRepositoryInput);
  }

  async revokeRefreshToken(refreshToken: string): Promise<UserRefreshToken> {
    const parsedToken = parseUserRefreshToken(refreshToken);

    if (!parsedToken) {
      throw new GenericUnauthorizedError('Invalid refresh token');
    }

    const authentication = await this.repository.findRefreshTokenAuthenticationById(parsedToken.id);

    if (!authentication) {
      throw new GenericUnauthorizedError('Invalid refresh token');
    }

    const validSecret = verifyUserRefreshTokenSecret(
      authentication.secretHash,
      parsedToken.secret,
      this.refreshTokenHashKey
    );

    if (!validSecret) {
      throw new GenericUnauthorizedError('Invalid refresh token');
    }

    return this.repository.revokeRefreshToken(authentication.refreshToken.id);
  }
}

/* exports */

export { UserService };
export type { UserServiceContract };
