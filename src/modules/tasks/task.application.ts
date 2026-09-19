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

/* schemas */

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

export const transitionTaskExecutionRepositoryInputSchema = z.object({
  id: taskExecutionIdSchema,
  revision: taskRevisionSchema,
  at: z.date()
});

export const failTaskExecutionRepositoryInputSchema = transitionTaskExecutionRepositoryInputSchema.extend({
  failureReason: z.string()
});

export const updateTaskStateRepositoryInputSchema = z.object({
  id: taskIdSchema,
  revision: taskRevisionSchema,
  state: taskStateSchema,
  at: z.date()
});

export const listTasksInSequenceRangeRepositoryInputSchema = z.object({
  afterSequence: taskSequenceSchema,
  upToSequence: taskSequenceSchema,
  limit: z.number().int().positive()
});

/* types */

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

export type TransitionTaskExecutionRepositoryInput = z.infer<typeof transitionTaskExecutionRepositoryInputSchema>;
export type FailTaskExecutionRepositoryInput = z.infer<typeof failTaskExecutionRepositoryInputSchema>;

export type UpdateTaskStateRepositoryInput = z.infer<typeof updateTaskStateRepositoryInputSchema>;

export type ListTasksInSequenceRangeRepositoryInput = z.infer<typeof listTasksInSequenceRangeRepositoryInputSchema>;
