import { Buffer } from 'node:buffer';

import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import { consensusLastSequenceSchema } from '@/modules/consensus/consensus.domain';
import { masterNodeIdSchema, type MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import {
  taskBaseSchema,
  taskDefinitionSchema,
  taskExecutionIdSchema,
  taskIdSchema,
  taskPayloadIdSchema,
  taskRevisionSchema,
  taskSequenceSchema,
  taskStateSchema,
  taskSubmissionStateSchema,
  taskTypeSchema,
  type TaskBase,
  type TaskExecutionScope,
  type TaskPayloadId,
  type TaskSubmissionState
} from './task.domain';

/* service schemas */

// query
export const listTasksInSequenceRangeInputSchema = z.object({
  afterSequence: taskSequenceSchema,
  upToSequence: taskSequenceSchema,
  limit: z.number().int().positive()
});

export const findLatestTaskByTypeUpToSequenceInputSchema = z.object({
  type: taskTypeSchema,
  upToSequence: consensusLastSequenceSchema
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

export const listTaskSubmissionCleanupCandidatesRepositoryInputSchema = z.object({
  updatedBefore: z.date(),
  limit: z.number().int().positive()
});

// find
export const findLatestTaskByTypeUpToSequenceRepositoryInputSchema = findLatestTaskByTypeUpToSequenceInputSchema;

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

export const createTaskSubmissionRepositoryInputSchema = taskBaseSchema
  .pick({ id: true, originMasterNodeId: true })
  .extend(taskDefinitionSchema.shape)
  .extend({
    targetMasterIds: z.array(masterNodeIdSchema),
    payloadId: taskPayloadIdSchema.nullable(),

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

// submission
export const transitionTaskSubmissionRepositoryInputSchema = z.object({
  id: taskIdSchema,
  revision: taskRevisionSchema,
  from: taskSubmissionStateSchema,
  to: taskSubmissionStateSchema,
  at: z.date()
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
export type FindLatestTaskByTypeUpToSequenceInput = z.infer<typeof findLatestTaskByTypeUpToSequenceInputSchema>;

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
export type ListTaskSubmissionCleanupCandidatesRepositoryInput = z.infer<
  typeof listTaskSubmissionCleanupCandidatesRepositoryInputSchema
>;

// find
export type FindLatestTaskByTypeUpToSequenceRepositoryInput = z.infer<
  typeof findLatestTaskByTypeUpToSequenceRepositoryInputSchema
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

export type CreateTaskSubmissionRepositoryInput<
  TType extends string = string,
  TScope extends TaskExecutionScope = TaskExecutionScope
> = Pick<TaskBase, 'id' | 'originMasterNodeId'> & {
  type: TType;
  data: Prisma.InputJsonValue;
  executionScope: TScope;
  targetMasterIds: MasterNodeId[];
  payloadId: TaskPayloadId | null;

  createdAt: Date;
  updatedAt: Date;
};

// execution
export type TransitionTaskExecutionRepositoryInput = z.infer<typeof transitionTaskExecutionRepositoryInputSchema>;
export type FailTaskExecutionRepositoryInput = z.infer<typeof failTaskExecutionRepositoryInputSchema>;

// submission
export type TransitionTaskSubmissionRepositoryInput = z.infer<typeof transitionTaskSubmissionRepositoryInputSchema>;

// update
export type UpdateTaskStateRepositoryInput = z.infer<typeof updateTaskStateRepositoryInputSchema>;
export type ClearTaskPayloadIdRepositoryInput = z.infer<typeof clearTaskPayloadIdRepositoryInputSchema>;

// delete
export type DeleteTaskSubmissionRepositoryInput = {
  id: TaskBase['id'];
  state: TaskSubmissionState;
};
