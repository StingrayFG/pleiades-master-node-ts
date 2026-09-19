import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { GenericAbortedError, GenericInternalServerError, GenericNotFoundError } from '@/errors/application.errors';
import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import type { TaskConfig } from './task.config';
import { isDehydratedTaskDefinition, type TaskDefinitionContract } from './task.definition';
import type { PersistedTask, Task, TaskExecution, TaskExecutionScope, TaskId, TaskState } from './task.domain';
import type { TaskHandler, TaskHandlerRegistryContract } from './task.handler-registry';
import type { TaskRepositoryContract } from './task.repository';
import { resolveTaskStateFromExecutions, resolveTaskTargetsFromScope } from './task.resolvers';
import type { TaskResultWaiterContract } from './task.result-waiter';

/* contract */

type TaskApplyHandlerContract = {
  run(): Promise<void>;
};

/* types */

type TaskExecutionOutcome =
  { status: 'completed'; result: unknown } | { status: 'failed'; error: unknown } | { status: 'aborted' };

/* handler */

class TaskApplyHandler implements TaskApplyHandlerContract {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: TaskRepositoryContract,
    private readonly handlerRegistry: TaskHandlerRegistryContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly byteStorageService: ByteStorageServiceContract,
    private readonly resultWaiter: TaskResultWaiterContract,
    private readonly selfMasterNodeId: MasterNodeId,
    private readonly config: TaskConfig
  ) {}

  /* public methods */

  run(): Promise<void> {
    const run = this.queue.then(() => this.runPendingTasks());

    this.queue = run.catch(() => undefined);

    return run;
  }

  /* private methods */

  /* apply lifecycle */

  private async runPendingTasks(): Promise<void> {
    const consensusState = await this.consensusService.getConsensusState();

    const tasks = await this.repository.listTasksInSequenceRange({
      afterSequence: consensusState.lastAppliedSequence,
      upToSequence: consensusState.lastCommittedSequence,
      limit: this.config.applyBatchSize
    });

    for (const task of tasks) {
      const applied = await this.applyTask(task);

      if (!applied) {
        break;
      }
    }
  }

  private async applyTask(task: PersistedTask): Promise<boolean> {
    if (task.state !== 'pending') {
      await this.consensusService.advanceLastAppliedSequence(task.sequence);

      return true;
    }

    let registration;

    try {
      registration = this.handlerRegistry.resolveByType(task.type);
    } catch (err) {
      if (!(err instanceof GenericNotFoundError)) {
        throw err;
      }

      await this.failTaskWithoutExecutions(task, err);

      return true;
    }

    let executions = await this.repository.listExecutionsByTaskId(task.id);

    if (executions.length === 0) {
      const targetMasterIds = resolveTaskTargetsFromScope(task.executionScope, this.selfMasterNodeId);

      const now = new Date();

      executions = await this.repository.createExecutions(
        targetMasterIds.map((targetMasterId) => ({
          id: randomUUID(),
          taskId: task.id,

          targetMasterId,

          createdAt: now,
          updatedAt: now
        }))
      );
    }

    const runnableExecutions = executions.filter(
      (execution) => execution.state !== 'completed' && execution.state !== 'failed'
    );

    // hydration may fetch a payload from storage, so skip it when every execution is already finalized
    let data: unknown;

    if (runnableExecutions.length > 0) {
      try {
        data = await this.hydrateTaskDataIfNeeded(task, registration.definition);
      } catch (err) {
        await this.failTaskWithoutExecutions(task, err);

        return true;
      }
    }

    const typedTask: Task = { ...task, data };

    const outcomes: TaskExecutionOutcome[] = [];

    for (const execution of runnableExecutions) {
      const outcome = await this.runExecution(typedTask, execution, registration.handler);

      if (outcome.status === 'aborted') {
        return false;
      }

      outcomes.push(outcome);
    }

    const finalExecutions = await this.repository.listExecutionsByTaskId(task.id);

    const state = resolveTaskStateFromExecutions(finalExecutions);

    if (state === 'pending') {
      return false;
    }

    await this.repository.updateTaskState({
      id: task.id,
      revision: task.revision,
      state,
      at: new Date()
    });

    // result delivery is best-effort and only applies to in-memory waiters
    // completed task state is the durable source of truth
    this.deliverOutcome(task.id, state, outcomes);

    await this.consensusService.advanceLastAppliedSequence(task.sequence);

    return true;
  }

  // task data restoration

  private async hydrateTaskDataIfNeeded(
    task: PersistedTask,
    definition: TaskDefinitionContract<string, unknown, unknown, TaskExecutionScope, unknown>
  ): Promise<unknown> {
    if (!isDehydratedTaskDefinition(definition)) {
      return z.decode(definition.dataSchema, task.data);
    }

    const persistedData = z.decode(definition.persistedDataSchema, task.data);

    if (task.payloadId === null) {
      throw new GenericInternalServerError('Dehydrated task is missing its payload reference');
    }

    const payload = await this.byteStorageService.retrieve(task.payloadId);

    return definition.hydrateData(persistedData, payload);
  }

  // execution lifecycle

  private async runExecution(
    task: Task,
    execution: TaskExecution,
    handler: TaskHandler
  ): Promise<TaskExecutionOutcome> {
    let executingExecution;

    try {
      executingExecution = await this.repository.markExecutionExecuting({
        id: execution.id,
        revision: execution.revision,
        at: new Date()
      });
    } catch (err) {
      if (err instanceof GenericAbortedError) {
        return { status: 'aborted' };
      }

      throw err;
    }

    try {
      const result = await handler(task);

      await this.repository.markExecutionCompleted({
        id: executingExecution.id,
        revision: executingExecution.revision,
        at: new Date()
      });

      return { status: 'completed', result };
    } catch (err) {
      await this.repository.markExecutionFailed({
        id: executingExecution.id,
        revision: executingExecution.revision,
        failureReason: err instanceof Error ? err.message : String(err),
        at: new Date()
      });

      return { status: 'failed', error: err };
    }
  }

  // completion handling

  private deliverOutcome(id: TaskId, state: TaskState, outcomes: TaskExecutionOutcome[]): void {
    if (state === 'completed') {
      const completedOutcome = outcomes.find((outcome) => outcome.status === 'completed');

      this.resultWaiter.deliver(id, completedOutcome?.status === 'completed' ? completedOutcome.result : undefined);

      return;
    }

    const failedOutcome = outcomes.find((outcome) => outcome.status === 'failed');

    this.resultWaiter.fail(
      id,
      failedOutcome?.status === 'failed' ? failedOutcome.error : new GenericInternalServerError('Task execution failed')
    );
  }

  // failure handling

  private async failTaskWithoutExecutions(task: PersistedTask, error: unknown): Promise<void> {
    await this.repository.updateTaskState({
      id: task.id,
      revision: task.revision,
      state: 'failed',
      at: new Date()
    });

    this.resultWaiter.fail(task.id, error);

    await this.consensusService.advanceLastAppliedSequence(task.sequence);
  }
}

/* exports */

export { TaskApplyHandler };
export type { TaskApplyHandlerContract };
