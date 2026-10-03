import { Buffer } from 'node:buffer';

import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { masterNodeIdSchema } from '@/modules/master-nodes/master-node.domain';

import {
  taskBaseSchema,
  taskDefinitionSchema,
  taskExecutionIdSchema,
  taskIdSchema,
  taskPayloadIdSchema,
  taskRevisionSchema,
  taskSequenceSchema,
  taskStateSchema,
  type TaskBase,
  type TaskExecutionScope,
  type TaskPayloadId
} from './task.domain';

/* service schemas */

// query
export const listTasksInSequenceRangeInputSchema = z.object({
  afterSequence: taskSequenceSchema,
  upToSequence: taskSequenceSchema,
  limit: z.number().int().positive()
});

// replication
export const replicateTaskInputSchema = taskBaseSchema
  .pick({ id: true, originMasterNodeId: true, epoch: true, sequence: true })
  .extend(taskDefinitionSchema.shape)
  .extend({
    payloadId: taskPayloadIdSchema.nullable(),
    payload: z.instanceof(Buffer).optional(),

    createdAt: z.date()
  });

/* repository schemas */

// list
export const listTasksInSequenceRangeRepositoryInputSchema = listTasksInSequenceRangeInputSchema;

export const listPayloadCleanupCandidatesRepositoryInputSchema = z.object({
  updatedBefore: z.date(),
  limit: z.number().int().positive()
});

export const listUncommittedCleanupCandidatesRepositoryInputSchema = z.object({
  afterSequence: taskSequenceSchema,
  updatedBefore: z.date(),
  limit: z.number().int().positive()
});

// create
export const createTaskRepositoryInputSchema = taskBaseSchema
  .pick({ id: true, originMasterNodeId: true, epoch: true, sequence: true })
  .extend(taskDefinitionSchema.shape)
  .extend({
    payloadId: taskPayloadIdSchema.nullable(),

    createdAt: z.date(),
    updatedAt: z.date()
  });

export const createTaskExecutionRepositoryInputSchema = z.object({
  id: taskExecutionIdSchema,
  taskId: taskIdSchema,

  targetMasterId: masterNodeIdSchema,

  createdAt: z.date(),
  updatedAt: z.date()
});

// execution
export const transitionTaskExecutionRepositoryInputSchema = z.object({
  id: taskExecutionIdSchema,
  revision: taskRevisionSchema,
  at: z.date()
});

export const failTaskExecutionRepositoryInputSchema = transitionTaskExecutionRepositoryInputSchema.extend({
  failureReason: z.string()
});

// update
export const updateTaskStateRepositoryInputSchema = z.object({
  id: taskIdSchema,
  revision: taskRevisionSchema,
  state: taskStateSchema,
  at: z.date()
});

export const clearTaskPayloadIdRepositoryInputSchema = z.object({
  id: taskIdSchema,
  revision: taskRevisionSchema
});

/* service types */

// query
export type ListTasksInSequenceRangeInput = z.infer<typeof listTasksInSequenceRangeInputSchema>;

// replication
export type ReplicateTaskInput = z.infer<typeof replicateTaskInputSchema>;

/* repository types */

// list
export type ListTasksInSequenceRangeRepositoryInput = z.infer<typeof listTasksInSequenceRangeRepositoryInputSchema>;
export type ListPayloadCleanupCandidatesRepositoryInput = z.infer<
  typeof listPayloadCleanupCandidatesRepositoryInputSchema
>;
export type ListUncommittedCleanupCandidatesRepositoryInput = z.infer<
  typeof listUncommittedCleanupCandidatesRepositoryInputSchema
>;

// create
export type CreateTaskRepositoryInput<
  TType extends string = string,
  TScope extends TaskExecutionScope = TaskExecutionScope
> = Pick<TaskBase, 'id' | 'originMasterNodeId' | 'epoch' | 'sequence'> & {
  type: TType;
  data: Prisma.InputJsonValue;
  executionScope: TScope;

  payloadId: TaskPayloadId | null;

  createdAt: Date;
  updatedAt: Date;
};

export type CreateTaskExecutionRepositoryInput = z.infer<typeof createTaskExecutionRepositoryInputSchema>;

// execution
export type TransitionTaskExecutionRepositoryInput = z.infer<typeof transitionTaskExecutionRepositoryInputSchema>;
export type FailTaskExecutionRepositoryInput = z.infer<typeof failTaskExecutionRepositoryInputSchema>;

// update
export type UpdateTaskStateRepositoryInput = z.infer<typeof updateTaskStateRepositoryInputSchema>;
export type ClearTaskPayloadIdRepositoryInput = z.infer<typeof clearTaskPayloadIdRepositoryInputSchema>;
