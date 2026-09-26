import { z } from 'zod';

import { jsonDateCodec } from '@/common/serializers/date.serializer';
import { createTaskDefinition } from '@/modules/tasks/task.definition';

import {
  userApiKeyIdSchema,
  userApiKeySchema,
  userIdSchema,
  userRefreshTokenIdSchema,
  userRefreshTokenSchema,
  userSchema,
  userUsernameSchema
} from './user.domain';

/* data schemas */

export const createUserTaskDataSchema = z.object({
  userId: userIdSchema,
  username: userUsernameSchema,

  passwordHash: z.string()
});

export const createUserApiKeyTaskDataSchema = z.object({
  apiKeyId: userApiKeyIdSchema,
  userId: userIdSchema,

  secretHash: z.string(),

  name: z.string(),

  expiresAt: jsonDateCodec.nullable()
});

export const revokeUserApiKeyTaskDataSchema = z.object({
  userId: userIdSchema,
  apiKeyId: userApiKeyIdSchema
});

export const createUserRefreshTokenTaskDataSchema = z.object({
  refreshTokenId: userRefreshTokenIdSchema,
  userId: userIdSchema,

  secretHash: z.string(),

  expiresAt: jsonDateCodec
});

export const rotateUserRefreshTokenTaskDataSchema = z.object({
  currentRefreshTokenId: userRefreshTokenIdSchema,
  newRefreshTokenId: userRefreshTokenIdSchema,

  userId: userIdSchema,

  secretHash: z.string(),

  expiresAt: jsonDateCodec
});

export const revokeUserRefreshTokenTaskDataSchema = z.object({
  refreshTokenId: userRefreshTokenIdSchema
});

/* result schemas */

export const userTaskResultSchema = userSchema.extend({
  createdAt: jsonDateCodec,
  updatedAt: jsonDateCodec
});

export const userApiKeyTaskResultSchema = userApiKeySchema.extend({
  createdAt: jsonDateCodec,
  expiresAt: jsonDateCodec.nullable(),
  lastUsedAt: jsonDateCodec.nullable(),
  revokedAt: jsonDateCodec.nullable()
});

export const userRefreshTokenTaskResultSchema = userRefreshTokenSchema.extend({
  createdAt: jsonDateCodec,
  expiresAt: jsonDateCodec,
  revokedAt: jsonDateCodec.nullable()
});

/* definitions */

export const createUserTaskDefinition = createTaskDefinition({
  type: 'user.create',
  executionScope: 'cluster',

  dataSchema: createUserTaskDataSchema,

  resultSchema: userTaskResultSchema
});

export const createUserApiKeyTaskDefinition = createTaskDefinition({
  type: 'user.api-key.create',
  executionScope: 'cluster',

  dataSchema: createUserApiKeyTaskDataSchema,

  resultSchema: userApiKeyTaskResultSchema
});

export const revokeUserApiKeyTaskDefinition = createTaskDefinition({
  type: 'user.api-key.revoke',
  executionScope: 'cluster',

  dataSchema: revokeUserApiKeyTaskDataSchema,

  resultSchema: userApiKeyTaskResultSchema
});

export const createUserRefreshTokenTaskDefinition = createTaskDefinition({
  type: 'user.refresh-token.create',
  executionScope: 'cluster',

  dataSchema: createUserRefreshTokenTaskDataSchema,

  resultSchema: userRefreshTokenTaskResultSchema
});

export const rotateUserRefreshTokenTaskDefinition = createTaskDefinition({
  type: 'user.refresh-token.rotate',
  executionScope: 'cluster',

  dataSchema: rotateUserRefreshTokenTaskDataSchema,

  resultSchema: userRefreshTokenTaskResultSchema
});

export const revokeUserRefreshTokenTaskDefinition = createTaskDefinition({
  type: 'user.refresh-token.revoke',
  executionScope: 'cluster',

  dataSchema: revokeUserRefreshTokenTaskDataSchema,

  resultSchema: userRefreshTokenTaskResultSchema
});

export const userTaskSchema = z.discriminatedUnion('type', [
  createUserTaskDefinition.taskSchema,
  createUserApiKeyTaskDefinition.taskSchema,
  revokeUserApiKeyTaskDefinition.taskSchema,
  createUserRefreshTokenTaskDefinition.taskSchema,
  rotateUserRefreshTokenTaskDefinition.taskSchema,
  revokeUserRefreshTokenTaskDefinition.taskSchema
]);

/* types */

export type CreateUserTaskData = z.infer<typeof createUserTaskDataSchema>;
export type CreateUserApiKeyTaskData = z.infer<typeof createUserApiKeyTaskDataSchema>;
export type RevokeUserApiKeyTaskData = z.infer<typeof revokeUserApiKeyTaskDataSchema>;
export type CreateUserRefreshTokenTaskData = z.infer<typeof createUserRefreshTokenTaskDataSchema>;
export type RotateUserRefreshTokenTaskData = z.infer<typeof rotateUserRefreshTokenTaskDataSchema>;
export type RevokeUserRefreshTokenTaskData = z.infer<typeof revokeUserRefreshTokenTaskDataSchema>;

export type CreateUserTask = z.infer<typeof createUserTaskDefinition.taskSchema>;
export type CreateUserApiKeyTask = z.infer<typeof createUserApiKeyTaskDefinition.taskSchema>;
export type RevokeUserApiKeyTask = z.infer<typeof revokeUserApiKeyTaskDefinition.taskSchema>;
export type CreateUserRefreshTokenTask = z.infer<typeof createUserRefreshTokenTaskDefinition.taskSchema>;
export type RotateUserRefreshTokenTask = z.infer<typeof rotateUserRefreshTokenTaskDefinition.taskSchema>;
export type RevokeUserRefreshTokenTask = z.infer<typeof revokeUserRefreshTokenTaskDefinition.taskSchema>;

export type UserTask = z.infer<typeof userTaskSchema>;
