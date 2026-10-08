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
import { createAggregateErrorCause } from '@/errors/error.causes';
import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';
import type { ConsensusLeadershipContext, ConsensusState } from '@/modules/consensus/consensus.domain';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import type { TaskApplyHandlerContract } from './task.apply-handler';
import type { ListTasksInSequenceRangeInput, ReplicateTaskInput } from './task.application';
import type { TaskConfig } from './task.config';
import {
  isDehydratedTaskDefinition,
  type TaskDefinition,
  type TaskDefinitionData,
  type TaskDefinitionHandler,
  type TaskDefinitionResult
} from './task.definition';
import type {
  PersistedTask,
  TaskExecutionScope,
  TaskId,
  TaskPayloadId,
  TaskSequence,
  TaskSubmission,
  TaskType
} from './task.domain';
import type { TaskForwarderContract } from './task.forwarder';
import type { TaskHandlerRegistryContract } from './task.handler-registry';
import type { TaskRepositoryContract } from './task.repository';
import { resolveTaskTargetsFromScope } from './task.resolvers';
import type { TaskResultWaiterContract } from './task.result-waiter';

/* contract */

type TaskServiceContract = {
  // query
  getTaskById(id: TaskId): Promise<PersistedTask>;
  findTaskBySequence(sequence: TaskSequence): Promise<PersistedTask | null>;
  listTasksInSequenceRange(input: ListTasksInSequenceRangeInput): Promise<PersistedTask[]>;
  retrieveTaskPayload(payloadId: TaskPayloadId): Promise<Buffer>;

  // replication
  replicateTask(input: ReplicateTaskInput, leadershipContext: ConsensusLeadershipContext): Promise<PersistedTask>;
  deleteTasksFromSequence(sequence: TaskSequence, leadershipContext: ConsensusLeadershipContext): Promise<number>;

  // registration
  registerHandler<TDefinition extends TaskDefinition>(
    definition: TDefinition,
    handler: TaskDefinitionHandler<TDefinition>
  ): void;
  getTaskDefinitionByType(type: TaskType): TaskDefinition;

  // submission
  submitTask<TDefinition extends TaskDefinition>(
    definition: TDefinition,
    data: TaskDefinitionData<TDefinition>
  ): Promise<PersistedTask>;

  // execution
  executeTaskByDefinition<TDefinition extends TaskDefinition>(
    definition: TDefinition,
    data: TaskDefinitionData<TDefinition>
  ): Promise<TaskDefinitionResult<TDefinition>>;
  executeTaskByDefinitionAndTargets<TDefinition extends TaskDefinition>(
    definition: TDefinition,
    data: TaskDefinitionData<TDefinition>,
    targetMasterIds: MasterNodeId[]
  ): Promise<TaskDefinitionResult<TDefinition>>;
};

/* service */

class TaskService implements TaskServiceContract {
  constructor(
    private readonly repository: TaskRepositoryContract,
    private readonly handlerRegistry: TaskHandlerRegistryContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly byteStorageService: ByteStorageServiceContract,
    private readonly taskForwarder: TaskForwarderContract,
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

  async findTaskBySequence(sequence: TaskSequence): Promise<PersistedTask | null> {
    return this.repository.findBySequence(sequence);
  }

  async listTasksInSequenceRange(input: ListTasksInSequenceRangeInput): Promise<PersistedTask[]> {
    return this.repository.listTasksInSequenceRange(input);
  }

  async retrieveTaskPayload(payloadId: TaskPayloadId): Promise<Buffer> {
    return this.byteStorageService.retrieve(payloadId);
  }

  /* replication methods */

  async replicateTask(
    input: ReplicateTaskInput,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<PersistedTask> {
    const consensusState = await this.consensusService.getConsensusState();

    this.requireLeadershipContext(consensusState, leadershipContext);

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
        await this.consensusService.advanceLastAllocatedSequence({
          leadershipContext,
          sequence: input.sequence
        });
      }

      return existingTask;
    }

    if (input.epoch > consensusState.currentEpoch) {
      throw new GenericFailedPreconditionError('Replicated task epoch is newer than the current consensus epoch');
    }

    if (input.sequence !== consensusState.lastAllocatedSequence + 1n) {
      throw new GenericFailedPreconditionError('Replicated task sequence is not the next allocatable sequence');
    }

    // the payload gets stored before the task entry itself so the allocated sequence never covers
    // a task entry whose bytes are missing.
    await this.storeTaskDataPayloadIfNeeded(input.payloadId, input.payload);

    // the leader-assigned sequence is claimed and the task entry is inserted in one
    // transaction, so the allocated pointer never covers a missing row either.
    const task = await this.consensusService.withAdvancedLastAllocatedSequence(leadershipContext, (tx, sequence) => {
      if (sequence !== input.sequence) {
        throw new GenericAbortedError('Replicated task sequence is no longer the next allocatable sequence');
      }

      return this.repository.create(
        {
          id: input.id,

          originMasterNodeId: input.originMasterNodeId,
          epoch: input.epoch,
          sequence,

          type: input.type,
          executionScope: input.executionScope,
          data: input.data as Prisma.InputJsonValue,

          payloadId: input.payloadId,

          createdAt: input.createdAt,
          updatedAt: input.createdAt
        },
        tx
      );
    });

    return task;
  }

  async deleteTasksFromSequence(
    sequence: TaskSequence,
    leadershipContext: ConsensusLeadershipContext
  ): Promise<number> {
    const consensusState = await this.consensusService.getConsensusState();

    this.requireLeadershipContext(consensusState, leadershipContext);

    if (sequence <= consensusState.lastCommittedSequence) {
      throw new GenericFailedPreconditionError('Committed task history cannot be deleted');
    }

    if (sequence > consensusState.lastAllocatedSequence + 1n) {
      return 0;
    }

    const result = await this.consensusService.withRewoundLastAllocatedSequence(
      {
        leadershipContext,
        sequence: sequence - 1n
      },
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

  registerHandler<TDefinition extends TaskDefinition>(
    definition: TDefinition,
    handler: TaskDefinitionHandler<TDefinition>
  ): void {
    this.handlerRegistry.register(definition, handler);
  }

  getTaskDefinitionByType(type: TaskType): TaskDefinition {
    return this.handlerRegistry.resolveByType(type).definition;
  }

  /* submission methods */

  async submitTask<TDefinition extends TaskDefinition>(
    definition: TDefinition,
    data: TaskDefinitionData<TDefinition>
  ): Promise<PersistedTask> {
    const id = randomUUID();

    return this.submitTaskWithId(definition, data, id);
  }

  /* execution methods */

  async executeTaskByDefinition<TDefinition extends TaskDefinition>(
    definition: TDefinition,
    data: TaskDefinitionData<TDefinition>
  ): Promise<TaskDefinitionResult<TDefinition>> {
    const consensusState = await this.consensusService.getConsensusState();

    if (consensusState.leaderMasterId !== this.selfMasterNodeId) {
      if (consensusState.leaderMasterId === null) {
        throw new GenericFailedPreconditionError('Task execution was rejected because the cluster has no leader');
      }

      return this.taskForwarder.forwardTask(definition, data, consensusState.leaderMasterId);
    }

    const targetMasterIds = resolveTaskTargetsFromScope(definition.executionScope, this.selfMasterNodeId);

    if (targetMasterIds.length === 0) {
      throw new GenericAbortedError('Task execution was aborted because no targets were resolved');
    }

    return this.executeTaskByDefinitionAndTargets(definition, data, targetMasterIds);
  }

  async executeTaskByDefinitionAndTargets<TDefinition extends TaskDefinition>(
    definition: TDefinition,
    data: TaskDefinitionData<TDefinition>,
    targetMasterIds: MasterNodeId[]
  ): Promise<TaskDefinitionResult<TDefinition>> {
    if (targetMasterIds.length === 0) {
      throw new GenericAbortedError('Task execution was aborted because no targets were resolved');
    }

    this.requireTaskHandlerRegistration(definition);

    const id = randomUUID();

    const resultPromise = this.resultWaiter.wait<TaskDefinitionResult<TDefinition>>(
      id,
      this.config.executionWaitTimeoutMs
    );

    // attach a rejection handler immediately to prevent unhandled rejections
    // before the final await consumes the result.
    void resultPromise.catch(() => undefined);

    try {
      await this.submitTaskWithExecutions(definition, data, targetMasterIds, id);
    } catch (err) {
      this.resultWaiter.fail(id, err);
    }

    // trigger an immediate apply attempt to reduce latency;
    // the periodic apply cycle will remain responsible for recovery.
    try {
      await this.applyHandler.run();
    } catch {
      // ignore transient apply failures here;
      // committed tasks remain available for the periodic apply cycle.
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
  >(definition: TaskDefinition<TType, TScope, TData, TPersistedData, TResult>): void {
    this.handlerRegistry.resolve(definition);
  }

  private requireLeadershipContext(
    consensusState: ConsensusState,
    leadershipContext: ConsensusLeadershipContext
  ): void {
    if (consensusState.leaderMasterId === null) {
      throw new GenericFailedPreconditionError('Task history mutation was rejected because the cluster has no leader');
    }

    if (
      consensusState.currentEpoch !== leadershipContext.epoch ||
      consensusState.leaderMasterId !== leadershipContext.leaderMasterId
    ) {
      throw new GenericAbortedError('Task history mutation was aborted because cluster leadership changed');
    }
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
    definition: TaskDefinition<TType, TScope, TData, TPersistedData, TResult>,
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

  /* payload storage */

  private async storeTaskDataPayloadIfNeeded(payloadId: TaskPayloadId | null, payload?: Buffer): Promise<void> {
    if (payloadId === null) {
      return;
    }

    if (payload === undefined) {
      throw new GenericInternalServerError('Dehydrated task data is missing its payload');
    }

    await this.byteStorageService.store(payloadId, payload);
  }

  /* task submission */

  private async storeTaskSubmissionPayload(submission: TaskSubmission, payload?: Buffer): Promise<void> {
    try {
      await this.storeTaskDataPayloadIfNeeded(submission.payloadId, payload);
    } catch (storageError) {
      try {
        await this.cleanupTaskSubmission(submission);
      } catch (cleanupError) {
        const cause = createAggregateErrorCause([
          { source: 'payload storage', error: storageError },
          { source: 'task submission cleanup', error: cleanupError }
        ]);

        throw new GenericInternalServerError('Failed to clean up task submission after payload storage failed', {
          cause
        });
      }

      throw storageError;
    }
  }

  private async cleanupTaskSubmission(submission: TaskSubmission): Promise<void> {
    const transitioned = await this.repository.transitionSubmissionState({
      id: submission.id,
      revision: submission.revision,
      from: 'pending',
      to: 'deleting',
      at: new Date()
    });

    if (!transitioned) {
      return;
    }

    if (submission.payloadId !== null) {
      await this.byteStorageService.delete(submission.payloadId);
    }

    await this.repository.deleteSubmission({
      id: submission.id,
      state: 'deleting'
    });
  }

  private async appendTaskSubmission(
    submission: TaskSubmission,
    consensusState: ConsensusState
  ): Promise<PersistedTask> {
    return this.consensusService.withAdvancedLastAllocatedSequence(
      {
        epoch: consensusState.currentEpoch,
        leaderMasterId: this.selfMasterNodeId
      },
      async (tx, sequence) => {
        const task = await this.repository.create(
          {
            id: submission.id,

            originMasterNodeId: submission.originMasterNodeId,
            epoch: consensusState.currentEpoch,
            sequence,

            type: submission.type,
            executionScope: submission.executionScope,
            data: submission.data as Prisma.InputJsonValue,

            payloadId: submission.payloadId,

            createdAt: submission.createdAt,
            updatedAt: submission.updatedAt
          },
          tx
        );

        if (submission.targetMasterIds.length > 0) {
          await this.repository.createExecutions(
            submission.targetMasterIds.map((targetMasterId) => ({
              id: randomUUID(),
              taskId: task.id,

              targetMasterId,

              createdAt: submission.createdAt,
              updatedAt: submission.updatedAt
            })),
            tx
          );
        }

        const deleted = await this.repository.deleteSubmission(
          {
            id: submission.id,
            state: 'pending'
          },
          tx
        );

        if (!deleted) {
          throw new GenericAbortedError('Task submission was changed before it could be appended');
        }

        return task;
      }
    );
  }

  private async prepareTaskSubmission<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope>(
    definition: TaskDefinition<TType, TScope, TData, TPersistedData, unknown>,
    data: TData,
    targetMasterIds: MasterNodeId[],
    id: TaskId
  ): Promise<{ submission: TaskSubmission; consensusState: ConsensusState }> {
    const now = new Date();

    const consensusState = await this.requireLeadershipState();

    const dehydratedData = this.dehydrateTaskDataIfNeeded(definition, data);

    const submission = await this.repository.createSubmission({
      id,

      originMasterNodeId: this.selfMasterNodeId,

      type: definition.type,
      executionScope: definition.executionScope,
      data: z.encode(definition.persistedDataSchema, dehydratedData.data) as Prisma.InputJsonValue,
      targetMasterIds,

      payloadId: dehydratedData.payloadId,

      createdAt: now,
      updatedAt: now
    });

    await this.storeTaskSubmissionPayload(submission, dehydratedData.payload);

    return { submission, consensusState };
  }

  private async submitTaskWithId<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope>(
    definition: TaskDefinition<TType, TScope, TData, TPersistedData, unknown>,
    data: TData,
    id: TaskId
  ): Promise<PersistedTask> {
    const { submission, consensusState } = await this.prepareTaskSubmission(definition, data, [], id);

    return this.appendTaskSubmission(submission, consensusState);
  }

  private async submitTaskWithExecutions<
    TType extends string,
    TData,
    TPersistedData,
    TScope extends TaskExecutionScope
  >(
    definition: TaskDefinition<TType, TScope, TData, TPersistedData, unknown>,
    data: TData,
    targetMasterIds: MasterNodeId[],
    id: TaskId
  ): Promise<PersistedTask> {
    const { submission, consensusState } = await this.prepareTaskSubmission(definition, data, targetMasterIds, id);

    return this.appendTaskSubmission(submission, consensusState);
  }
}

/* exports */

export { TaskService };
export type { TaskServiceContract };
