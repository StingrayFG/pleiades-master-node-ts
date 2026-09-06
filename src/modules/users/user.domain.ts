import { z } from 'zod';

/* field schemas */

export const userIdSchema = z.uuid();
export const userUsernameSchema = z.string().min(3).max(64);
export const userStateSchema = z.enum(['active', 'disabled']);

export const userApiKeyIdSchema = z.uuid();
export const userApiKeyStateSchema = z.enum(['active', 'revoked']);

export const userRefreshTokenIdSchema = z.uuid();
export const userRefreshTokenStateSchema = z.enum(['active', 'revoked']);

/* object schemas */

export const userSchema = z.object({
  id: userIdSchema,

  username: userUsernameSchema,

  state: userStateSchema,

  createdAt: z.date(),
  updatedAt: z.date()
});

export const userApiKeySchema = z.object({
  id: userApiKeyIdSchema,

  userId: userIdSchema,

  state: userApiKeyStateSchema,

  name: z.string(),

  createdAt: z.date(),
  expiresAt: z.date().nullable(),
  lastUsedAt: z.date().nullable(),
  revokedAt: z.date().nullable()
});

export const userRefreshTokenSchema = z.object({
  id: userRefreshTokenIdSchema,

  userId: userIdSchema,

  state: userRefreshTokenStateSchema,

  createdAt: z.date(),
  expiresAt: z.date(),
  revokedAt: z.date().nullable()
});

/* types */

export type UserId = z.infer<typeof userIdSchema>;
export type UserUsername = z.infer<typeof userUsernameSchema>;
export type UserState = z.infer<typeof userStateSchema>;

export type UserApiKeyId = z.infer<typeof userApiKeyIdSchema>;
export type UserApiKeyState = z.infer<typeof userApiKeyStateSchema>;

export type UserRefreshTokenId = z.infer<typeof userRefreshTokenIdSchema>;
export type UserRefreshTokenState = z.infer<typeof userRefreshTokenStateSchema>;

export type User = z.infer<typeof userSchema>;
export type UserApiKey = z.infer<typeof userApiKeySchema>;
export type UserRefreshToken = z.infer<typeof userRefreshTokenSchema>;
