import type { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import {
  GenericAbortedError,
  GenericConflictError,
  GenericFailedPreconditionError,
  GenericInternalServerError,
  GenericNotFoundError
} from '@/errors/application.errors';
import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import type { TaskApplyHandlerContract } from './task.apply-handler';
import type { ListTasksInSequenceRangeInput, ReplicateTaskInput } from './task.application';
import type { TaskConfig } from './task.config';
import { isDehydratedTaskDefinition, type TaskDefinitionContract } from './task.definition';
import type { PersistedTask, TaskExecutionScope, TaskId, TaskPayloadId, TaskSequence } from './task.domain';
import type { TaskHandler, TaskHandlerRegistryContract } from './task.handler-registry';
import type { TaskRepositoryContract } from './task.repository';
import { resolveTaskTargetsFromScope } from './task.resolvers';
import type { TaskResultWaiterContract } from './task.result-waiter';

/* contract */

type TaskServiceContract = {
  // query
  getTaskById(id: TaskId): Promise<PersistedTask>;
  listTasksInSequenceRange(input: ListTasksInSequenceRangeInput): Promise<PersistedTask[]>;
  retrieveTaskPayload(payloadId: TaskPayloadId): Promise<Buffer>;

  // replication
  replicateTask(input: ReplicateTaskInput): Promise<PersistedTask>;
  deleteTasksFromSequence(sequence: TaskSequence): Promise<number>;

  // registration
  registerHandler<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope, TResult>(
    definition: TaskDefinitionContract<TType, TScope, TData, TPersistedData, TResult>,
    handler: TaskHandler<TType, TData, TScope, TResult>
  ): void;

  // submission
  submitTask<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope>(
    definition: TaskDefinitionContract<TType, TScope, TData, TPersistedData, unknown>,
    data: TData
  ): Promise<PersistedTask>;

  // execution
  executeTaskByDefinition<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope, TResult>(
    definition: TaskDefinitionContract<TType, TScope, TData, TPersistedData, TResult>,
    data: TData
  ): Promise<TResult>;
  executeTaskByDefinitionAndTargets<
    TType extends string,
    TData,
    TPersistedData,
    TScope extends TaskExecutionScope,
    TResult
  >(
    definition: TaskDefinitionContract<TType, TScope, TData, TPersistedData, TResult>,
    data: TData,
    targetMasterIds: MasterNodeId[]
  ): Promise<TResult>;
};

/* service */

class TaskService implements TaskServiceContract {
  constructor(
    private readonly repository: TaskRepositoryContract,
    private readonly handlerRegistry: TaskHandlerRegistryContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly byteStorageService: ByteStorageServiceContract,
    private readonly applyHandler: TaskApplyHandlerContract,
    private readonly resultWaiter: TaskResultWaiterContract,
    private readonly selfMasterNodeId: MasterNodeId,
    private readonly config: TaskConfig
  ) {}

  /* public methods */

  /* query methods */

  async getTaskById(id: TaskId): Promise<PersistedTask> {
    const task = await this.repository.findById(id);

    if (!task) {
      throw new GenericNotFoundError();
    }

    return task;
  }

  async listTasksInSequenceRange(input: ListTasksInSequenceRangeInput): Promise<PersistedTask[]> {
    return this.repository.listTasksInSequenceRange(input);
  }

  async retrieveTaskPayload(payloadId: TaskPayloadId): Promise<Buffer> {
    return this.byteStorageService.retrieve(payloadId);
  }

  /* replication methods */

  async replicateTask(input: ReplicateTaskInput): Promise<PersistedTask> {
    const consensusState = await this.consensusService.getConsensusState();
    const existingTask = await this.repository.findBySequence(input.sequence);

    if (existingTask) {
      this.requireExactTaskReplay(existingTask, input);

      const nextSequence = consensusState.lastAllocatedSequence + 1n;

      if (input.sequence > nextSequence) {
        throw new GenericFailedPreconditionError('Replicated task sequence contains a gap');
      }

      if (input.sequence === nextSequence && input.epoch > consensusState.currentEpoch) {
        throw new GenericFailedPreconditionError('Replicated task epoch is newer than the current consensus epoch');
      }

      await this.storeTaskDataPayloadIfNeeded(input.payloadId, input.payload);

      if (input.sequence === nextSequence) {
        await this.consensusService.advanceLastAllocatedSequence(input.sequence);
      }

      return existingTask;
    }

    if (input.epoch > consensusState.currentEpoch) {
      throw new GenericFailedPreconditionError('Replicated task epoch is newer than the current consensus epoch');
    }

    if (input.sequence !== consensusState.lastAllocatedSequence + 1n) {
      throw new GenericFailedPreconditionError('Replicated task sequence is not the next allocatable sequence');
    }

    const task = await this.repository.create({
      id: input.id,

      originMasterNodeId: input.originMasterNodeId,
      epoch: input.epoch,
      sequence: input.sequence,

      type: input.type,
      executionScope: input.executionScope,
      data: input.data as Prisma.InputJsonValue,

      payloadId: input.payloadId,

      createdAt: input.createdAt,
      updatedAt: input.createdAt
    });

    await this.storeTaskDataPayloadIfNeeded(input.payloadId, input.payload);
    await this.consensusService.advanceLastAllocatedSequence(input.sequence);

    return task;
  }

  async deleteTasksFromSequence(sequence: TaskSequence): Promise<number> {
    const consensusState = await this.consensusService.getConsensusState();

    if (sequence <= consensusState.lastCommittedSequence) {
      throw new GenericFailedPreconditionError('Committed task history cannot be deleted');
    }

    if (sequence > consensusState.lastAllocatedSequence + 1n) {
      return 0;
    }

    const result = await this.consensusService.withRewoundLastAllocatedSequence(
      consensusState.currentEpoch,
      sequence - 1n,
      async (tx) => {
        const tasks = await this.repository.listTasksFromSequence(sequence, tx);
        const deletedCount = await this.repository.truncateFromSequence(sequence, tx);

        return { tasks, deletedCount };
      }
    );

    await Promise.all(
      result.tasks.map(async (task) => {
        if (task.payloadId !== null) {
          await this.byteStorageService.delete(task.payloadId);
        }
      })
    );

    return result.deletedCount;
  }

  /* registration methods */

  registerHandler<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope, TResult>(
    definition: TaskDefinitionContract<TType, TScope, TData, TPersistedData, TResult>,
    handler: TaskHandler<TType, TData, TScope, TResult>
  ): void {
    this.handlerRegistry.register(definition, handler);
  }

  /* submission methods */

  async submitTask<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope>(
    definition: TaskDefinitionContract<TType, TScope, TData, TPersistedData, unknown>,
    data: TData
  ): Promise<PersistedTask> {
    const id = randomUUID();

    const task = await this.submitTaskWithId(definition, data, id);

    await this.consensusService.advanceLastCommittedSequence(task.sequence);

    return task;
  }

  /* execution methods */

  async executeTaskByDefinition<
    TType extends string,
    TData,
    TPersistedData,
    TScope extends TaskExecutionScope,
    TResult
  >(definition: TaskDefinitionContract<TType, TScope, TData, TPersistedData, TResult>, data: TData): Promise<TResult> {
    const targetMasterIds = resolveTaskTargetsFromScope(definition.executionScope, this.selfMasterNodeId);

    if (targetMasterIds.length === 0) {
      throw new GenericAbortedError('Task execution was aborted because no targets were resolved');
    }

    return this.executeTaskByDefinitionAndTargets(definition, data, targetMasterIds);
  }

  async executeTaskByDefinitionAndTargets<
    TType extends string,
    TData,
    TPersistedData,
    TScope extends TaskExecutionScope,
    TResult
  >(
    definition: TaskDefinitionContract<TType, TScope, TData, TPersistedData, TResult>,
    data: TData,
    targetMasterIds: MasterNodeId[]
  ): Promise<TResult> {
    if (targetMasterIds.length === 0) {
      throw new GenericAbortedError('Task execution was aborted because no targets were resolved');
    }

    this.requireTaskHandlerRegistration(definition);

    const id = randomUUID();

    const resultPromise = this.resultWaiter.wait<TResult>(id, this.config.executionWaitTimeoutMs);

    // attach a rejection handler immediately to prevent unhandled rejections
    // before the final await consumes the result.
    void resultPromise.catch(() => undefined);

    try {
      const task = await this.submitTaskWithExecutions(definition, data, targetMasterIds, id);

      await this.consensusService.advanceLastCommittedSequence(task.sequence);
    } catch (err) {
      this.resultWaiter.fail(id, err);
    }

    // trigger an immediate apply attempt to reduce latency;
    // the background sweep remains responsible for recovery.
    try {
      await this.applyHandler.run();
    } catch {
      // ignore transient sweep failures here; execution state is recovered through the regular apply cycle.
    }

    return resultPromise;
  }

  /* private methods */

  /* validation / guards */

  private requireTaskHandlerRegistration<
    TType extends string,
    TData,
    TPersistedData,
    TScope extends TaskExecutionScope,
    TResult
  >(definition: TaskDefinitionContract<TType, TScope, TData, TPersistedData, TResult>): void {
    this.handlerRegistry.resolve(definition);
  }

  private requireExactTaskReplay(existingTask: PersistedTask, input: ReplicateTaskInput): void {
    if (
      existingTask.id !== input.id ||
      existingTask.originMasterNodeId !== input.originMasterNodeId ||
      existingTask.epoch !== input.epoch ||
      existingTask.sequence !== input.sequence ||
      existingTask.type !== input.type ||
      existingTask.executionScope !== input.executionScope ||
      !isDeepStrictEqual(existingTask.data, input.data) ||
      existingTask.payloadId !== input.payloadId ||
      existingTask.createdAt.getTime() !== input.createdAt.getTime()
    ) {
      throw new GenericConflictError('Replicated task does not match the existing task at this sequence');
    }
  }

  private async requireLeadershipState(): Promise<ConsensusState> {
    const consensusState = await this.consensusService.getConsensusState();

    if (consensusState.leaderMasterId !== this.selfMasterNodeId) {
      throw new GenericFailedPreconditionError(
        'Task submission was rejected because this node is not the cluster leader'
      );
    }

    return consensusState;
  }

  /* data transformation */

  private dehydrateTaskDataIfNeeded<
    TType extends string,
    TData,
    TPersistedData,
    TScope extends TaskExecutionScope,
    TResult
  >(
    definition: TaskDefinitionContract<TType, TScope, TData, TPersistedData, TResult>,
    data: TData
  ): { data: TPersistedData; payloadId: TaskPayloadId | null; payload?: Buffer } {
    if (isDehydratedTaskDefinition(definition)) {
      const dehydratedData = definition.dehydrateData(data);

      return {
        data: dehydratedData.data,
        payloadId: randomUUID(),
        payload: dehydratedData.payload
      };
    }

    return { data: data as unknown as TPersistedData, payloadId: null };
  }

  private async storeTaskDataPayloadIfNeeded(payloadId: TaskPayloadId | null, payload?: Buffer): Promise<void> {
    if (payloadId === null) {
      return;
    }

    if (payload === undefined) {
      throw new GenericInternalServerError('Dehydrated task data is missing its payload');
    }

    // always called after the task row is created, so a failed store never leaves an unreferenced payload behind
    await this.byteStorageService.store(payloadId, payload);
  }

  /* task creation flows */

  private async submitTaskWithId<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope>(
    definition: TaskDefinitionContract<TType, TScope, TData, TPersistedData, unknown>,
    data: TData,
    id: TaskId
  ): Promise<PersistedTask> {
    const now = new Date();

    const consensusState = await this.requireLeadershipState();

    const dehydratedData = this.dehydrateTaskDataIfNeeded(definition, data);

    const task = await this.consensusService.withAdvancedLastAllocatedSequence(
      consensusState.currentEpoch,
      (tx, sequence) =>
        this.repository.create(
          {
            id,

            originMasterNodeId: this.selfMasterNodeId,
            epoch: consensusState.currentEpoch,
            sequence,

            type: definition.type,
            executionScope: definition.executionScope,
            data: z.encode(definition.persistedDataSchema, dehydratedData.data) as Prisma.InputJsonValue,

            payloadId: dehydratedData.payloadId,

            createdAt: now,
            updatedAt: now
          },
          tx
        )
    );

    await this.storeTaskDataPayloadIfNeeded(dehydratedData.payloadId, dehydratedData.payload);

    return task;
  }

  private async submitTaskWithExecutions<
    TType extends string,
    TData,
    TPersistedData,
    TScope extends TaskExecutionScope
  >(
    definition: TaskDefinitionContract<TType, TScope, TData, TPersistedData, unknown>,
    data: TData,
    targetMasterIds: MasterNodeId[],
    id: TaskId
  ): Promise<PersistedTask> {
    const now = new Date();

    const consensusState = await this.requireLeadershipState();

    const dehydratedData = this.dehydrateTaskDataIfNeeded(definition, data);

    const task = await this.consensusService.withAdvancedLastAllocatedSequence(
      consensusState.currentEpoch,
      async (tx, sequence) => {
        const createdTask = await this.repository.create(
          {
            id,

            originMasterNodeId: this.selfMasterNodeId,
            epoch: consensusState.currentEpoch,
            sequence,

            type: definition.type,
            executionScope: definition.executionScope,
            data: z.encode(definition.persistedDataSchema, dehydratedData.data) as Prisma.InputJsonValue,

            payloadId: dehydratedData.payloadId,

            createdAt: now,
            updatedAt: now
          },
          tx
        );

        await this.repository.createExecutions(
          targetMasterIds.map((targetMasterId) => ({
            id: randomUUID(),
            taskId: createdTask.id,

            targetMasterId,

            createdAt: now,
            updatedAt: now
          })),
          tx
        );

        return createdTask;
      }
    );

    await this.storeTaskDataPayloadIfNeeded(dehydratedData.payloadId, dehydratedData.payload);

    return task;
  }
}

/* exports */

export { TaskService };
export type { TaskServiceContract };
