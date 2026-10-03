import { z } from 'zod';

import {
  userApiKeyIdSchema,
  userApiKeySchema,
  userIdSchema,
  userRefreshTokenIdSchema,
  userRefreshTokenSchema,
  userSchema,
  userUsernameSchema
} from './user.domain';

/* service schemas */

export const createUserInputSchema = z.object({
  username: userUsernameSchema,
  password: z.string()
});

export const createUserApiKeyInputSchema = z.object({
  userId: userIdSchema,

  name: z.string(),

  expiresAt: z.date().nullable()
});

export const createApiKeyResultSchema = z.object({
  apiKey: userApiKeySchema,
  token: z.string()
});

export const authenticatePasswordInputSchema = z.object({
  username: userUsernameSchema,
  password: z.string()
});

export const apiKeyAuthenticationPrincipalSchema = z.object({
  userId: userIdSchema,

  apiKeyId: userApiKeyIdSchema
});

export const refreshAuthenticationResultSchema = z.object({
  userId: userIdSchema,

  refreshToken: z.string()
});

export const revokeUserApiKeyInputSchema = z.object({
  userId: userIdSchema,

  apiKeyId: userApiKeyIdSchema
});

/* repository schemas */

export const findAuthenticationByUsernameRepositoryResultSchema = z.object({
  user: userSchema,

  passwordHash: z.string()
});

export const findApiKeyAuthenticationByIdRepositoryResultSchema = z.object({
  user: userSchema,

  apiKey: userApiKeySchema,

  secretHash: z.string()
});

export const findRefreshTokenAuthenticationByIdRepositoryResultSchema = z.object({
  user: userSchema,

  refreshToken: userRefreshTokenSchema,

  secretHash: z.string()
});

export const createUserRepositoryInputSchema = z.object({
  id: userIdSchema,
  username: userUsernameSchema,

  passwordHash: z.string()
});

export const createUserApiKeyRepositoryInputSchema = z.object({
  id: userApiKeyIdSchema,

  userId: userIdSchema,

  secretHash: z.string(),

  name: z.string(),

  expiresAt: z.date().nullable()
});

export const createUserRefreshTokenRepositoryInputSchema = z.object({
  id: userRefreshTokenIdSchema,

  userId: userIdSchema,

  secretHash: z.string(),

  expiresAt: z.date()
});

export const rotateUserRefreshTokenRepositoryInputSchema = z.object({
  currentRefreshTokenId: userRefreshTokenIdSchema,
  newRefreshTokenId: userRefreshTokenIdSchema,

  userId: userIdSchema,

  secretHash: z.string(),

  expiresAt: z.date()
});

export const revokeUserApiKeyRepositoryInputSchema = z.object({
  userId: userIdSchema,

  apiKeyId: userApiKeyIdSchema
});

/* service types */

export type CreateUserInput = z.infer<typeof createUserInputSchema>;
export type CreateUserApiKeyInput = z.infer<typeof createUserApiKeyInputSchema>;
export type CreateApiKeyResult = z.infer<typeof createApiKeyResultSchema>;
export type AuthenticatePasswordInput = z.infer<typeof authenticatePasswordInputSchema>;
export type ApiKeyAuthenticationPrincipal = z.infer<typeof apiKeyAuthenticationPrincipalSchema>;
export type RefreshAuthenticationResult = z.infer<typeof refreshAuthenticationResultSchema>;
export type RevokeUserApiKeyInput = z.infer<typeof revokeUserApiKeyInputSchema>;

/* repository types */

export type FindAuthenticationByUsernameRepositoryResult = z.infer<
  typeof findAuthenticationByUsernameRepositoryResultSchema
>;
export type FindApiKeyAuthenticationByIdRepositoryResult = z.infer<
  typeof findApiKeyAuthenticationByIdRepositoryResultSchema
>;
export type FindRefreshTokenAuthenticationByIdRepositoryResult = z.infer<
  typeof findRefreshTokenAuthenticationByIdRepositoryResultSchema
>;
export type CreateUserRepositoryInput = z.infer<typeof createUserRepositoryInputSchema>;
export type CreateUserApiKeyRepositoryInput = z.infer<typeof createUserApiKeyRepositoryInputSchema>;
export type CreateUserRefreshTokenRepositoryInput = z.infer<typeof createUserRefreshTokenRepositoryInputSchema>;
export type RotateUserRefreshTokenRepositoryInput = z.infer<typeof rotateUserRefreshTokenRepositoryInputSchema>;
export type RevokeUserApiKeyRepositoryInput = z.infer<typeof revokeUserApiKeyRepositoryInputSchema>;
