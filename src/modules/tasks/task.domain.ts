import { z } from 'zod';

import { consensusEpochSchema, consensusSequenceSchema } from '@/modules/consensus/consensus.domain';
import { masterNodeIdSchema } from '@/modules/master-nodes/master-node.domain';

/* field schemas */

export const TASK_STATES = ['pending', 'completed', 'partially_completed', 'failed'] as const;
export const TASK_EXECUTION_STATES = ['pending', 'executing', 'completed', 'failed'] as const;
export const TASK_EXECUTION_SCOPES = ['local', 'cluster'] as const;

export const taskIdSchema = z.uuid();
export const taskEpochSchema = consensusEpochSchema;
export const taskSequenceSchema = consensusSequenceSchema;
export const taskStateSchema = z.enum(TASK_STATES);
export const taskRevisionSchema = z.bigint().nonnegative();

export const taskTypeSchema = z.string().min(1);
export const taskExecutionScopeSchema = z.enum(TASK_EXECUTION_SCOPES);
export const taskDataSchema = z.unknown();
export const taskPayloadIdSchema = z.uuid();

export const taskExecutionIdSchema = z.uuid();
export const taskExecutionStateSchema = z.enum(TASK_EXECUTION_STATES);

/* object schemas */

export const taskBaseSchema = z.object({
  id: taskIdSchema,

  originMasterNodeId: masterNodeIdSchema,
  epoch: taskEpochSchema,
  sequence: taskSequenceSchema,

  state: taskStateSchema,

  revision: taskRevisionSchema
});

export const taskDefinitionSchema = z.object({
  type: taskTypeSchema,
  data: taskDataSchema,
  executionScope: taskExecutionScopeSchema
});

export const persistedTaskSchema = taskBaseSchema.extend(taskDefinitionSchema.shape).extend({
  payloadId: taskPayloadIdSchema.nullable(),

  createdAt: z.date(),
  updatedAt: z.date()
});

export const taskExecutionSchema = z.object({
  id: taskExecutionIdSchema,
  taskId: taskIdSchema,

  targetMasterId: masterNodeIdSchema,

  state: taskExecutionStateSchema,
  failureReason: z.string().nullable(),

  createdAt: z.date(),
  startedAt: z.date().nullable(),
  completedAt: z.date().nullable(),
  updatedAt: z.date(),

  revision: taskRevisionSchema
});

/* types */

export type TaskId = z.infer<typeof taskIdSchema>;
export type TaskEpoch = z.infer<typeof taskEpochSchema>;
export type TaskSequence = z.infer<typeof taskSequenceSchema>;
export type TaskState = z.infer<typeof taskStateSchema>;
export type TaskRevision = z.infer<typeof taskRevisionSchema>;

export type TaskType = z.infer<typeof taskTypeSchema>;
export type TaskExecutionScope = z.infer<typeof taskExecutionScopeSchema>;
export type TaskPayloadId = z.infer<typeof taskPayloadIdSchema>;

export type TaskExecutionId = z.infer<typeof taskExecutionIdSchema>;
export type TaskExecutionState = z.infer<typeof taskExecutionStateSchema>;

export type TaskBase = z.infer<typeof taskBaseSchema>;

export type TaskDefinition<
  TType extends string = TaskType,
  TData = unknown,
  TScope extends TaskExecutionScope = TaskExecutionScope
> = {
  type: TType;
  data: TData;
  executionScope: TScope;
};

export type PersistedTask = z.infer<typeof persistedTaskSchema>;

export type Task<
  TType extends string = TaskType,
  TData = unknown,
  TScope extends TaskExecutionScope = TaskExecutionScope
> = Omit<PersistedTask, 'type' | 'executionScope' | 'data'> & TaskDefinition<TType, TData, TScope>;

export type TaskExecution = z.infer<typeof taskExecutionSchema>;
