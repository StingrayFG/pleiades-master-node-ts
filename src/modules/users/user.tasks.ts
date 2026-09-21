import { z } from 'zod';

import { jsonDateCodec } from '@/common/serializers/date.serializer';
import { createTaskDefinition } from '@/modules/tasks/task.definition';

import {
  userApiKeyIdSchema,
  userIdSchema,
  userRefreshTokenIdSchema,
  userUsernameSchema,
  type User,
  type UserApiKey,
  type UserRefreshToken
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

/* definitions */

export const createUserTaskDefinition = createTaskDefinition<CreateUserTaskData, User>({
  type: 'user.create',
  executionScope: 'cluster',
  dataSchema: createUserTaskDataSchema
});

export const createUserApiKeyTaskDefinition = createTaskDefinition<CreateUserApiKeyTaskData, UserApiKey>({
  type: 'user.api-key.create',
  executionScope: 'cluster',
  dataSchema: createUserApiKeyTaskDataSchema
});

export const revokeUserApiKeyTaskDefinition = createTaskDefinition<RevokeUserApiKeyTaskData, UserApiKey>({
  type: 'user.api-key.revoke',
  executionScope: 'cluster',
  dataSchema: revokeUserApiKeyTaskDataSchema
});

export const createUserRefreshTokenTaskDefinition = createTaskDefinition<CreateUserRefreshTokenTaskData, UserRefreshToken>(
  {
    type: 'user.refresh-token.create',
    executionScope: 'cluster',
    dataSchema: createUserRefreshTokenTaskDataSchema
  }
);

export const rotateUserRefreshTokenTaskDefinition = createTaskDefinition<RotateUserRefreshTokenTaskData, UserRefreshToken>(
  {
    type: 'user.refresh-token.rotate',
    executionScope: 'cluster',
    dataSchema: rotateUserRefreshTokenTaskDataSchema
  }
);

export const revokeUserRefreshTokenTaskDefinition = createTaskDefinition<RevokeUserRefreshTokenTaskData, UserRefreshToken>(
  {
    type: 'user.refresh-token.revoke',
    executionScope: 'cluster',
    dataSchema: revokeUserRefreshTokenTaskDataSchema
  }
);

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
