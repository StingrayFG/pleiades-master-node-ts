import type { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import { z } from 'zod';

import {
  GenericAbortedError,
  GenericFailedPreconditionError,
  GenericInternalServerError,
  GenericNotFoundError
} from '@/errors/application.errors';
import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';
import type { ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import type { TaskApplyHandlerContract } from './task.apply-handler';
import type { TaskConfig } from './task.config';
import { isDehydratedTaskDefinition, type TaskDefinitionContract } from './task.definition';
import type { PersistedTask, TaskExecutionScope, TaskId, TaskPayloadId } from './task.domain';
import type { TaskHandler, TaskHandlerRegistryContract } from './task.handler-registry';
import type { TaskRepositoryContract } from './task.repository';
import { resolveTaskTargetsFromScope } from './task.resolvers';
import type { TaskResultWaiterContract } from './task.result-waiter';

/* contract */

type TaskServiceContract = {
  getTaskById(id: TaskId): Promise<PersistedTask>;
  registerHandler<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope, TResult>(
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, TResult>,
    handler: TaskHandler<TType, TData, TScope, TResult>
  ): void;
  submitTask<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope>(
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, unknown>,
    data: TData
  ): Promise<PersistedTask>;
  executeTaskByDefinition<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope, TResult>(
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, TResult>,
    data: TData
  ): Promise<TResult>;
  executeTaskByDefinitionAndTargets<
    TType extends string,
    TData,
    TPersistedData,
    TScope extends TaskExecutionScope,
    TResult
  >(
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, TResult>,
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

  // query

  async getTaskById(id: TaskId): Promise<PersistedTask> {
    const task = await this.repository.findById(id);

    if (!task) {
      throw new GenericNotFoundError();
    }

    return task;
  }

  // registration

  registerHandler<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope, TResult>(
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, TResult>,
    handler: TaskHandler<TType, TData, TScope, TResult>
  ): void {
    this.handlerRegistry.register(definition, handler);
  }

  // submission

  async submitTask<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope>(
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, unknown>,
    data: TData
  ): Promise<PersistedTask> {
    const id = randomUUID();

    const task = await this.submitTaskWithId(definition, data, id);

    await this.consensusService.advanceLastCommittedSequence(task.sequence);

    return task;
  }

  // execution

  async executeTaskByDefinition<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope, TResult>(
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, TResult>,
    data: TData
  ): Promise<TResult> {
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
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, TResult>,
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

  // validation / guards

  private requireTaskHandlerRegistration<
    TType extends string,
    TData,
    TPersistedData,
    TScope extends TaskExecutionScope,
    TResult
  >(definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, TResult>): void {
    this.handlerRegistry.resolve(definition);
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

  // data transformation

  private dehydrateTaskDataIfNeeded<
    TType extends string,
    TData,
    TPersistedData,
    TScope extends TaskExecutionScope,
    TResult
  >(
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, TResult>,
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

  // task creation flows

  private async submitTaskWithId<
    TType extends string,
    TData,
    TPersistedData,
    TScope extends TaskExecutionScope
  >(
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, unknown>,
    data: TData,
    id: TaskId
  ): Promise<PersistedTask> {
    const now = new Date();

    const consensusState = await this.requireLeadershipState();

    const dehydratedData = this.dehydrateTaskDataIfNeeded(definition, data);

    const task = await this.consensusService.withAdvancedLastAllocatedSequence(consensusState.currentEpoch, (tx, sequence) =>
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
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, unknown>,
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
