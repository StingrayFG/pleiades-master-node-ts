import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { GenericAbortedError, GenericInternalServerError, GenericNotFoundError } from '@/errors/application.errors';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';
import type { MasterNodeId } from '@/modules/master-nodes/master-node.domain';

import type { TaskConfig } from './task.config';
import type { PersistedTask, Task, TaskExecution, TaskId, TaskState } from './task.domain';
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
  | { status: 'completed'; result: unknown }
  | { status: 'failed'; error: unknown }
  | { status: 'aborted' };

/* handler */

class TaskApplyHandler implements TaskApplyHandlerContract {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: TaskRepositoryContract,
    private readonly handlerRegistry: TaskHandlerRegistryContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly resultWaiter: TaskResultWaiterContract,
    private readonly selfMasterNodeId: MasterNodeId,
    private readonly config: TaskConfig
  ) {}

  run(): Promise<void> {
    const run = this.queue.then(() => this.runPendingTasks());

    this.queue = run.catch(() => undefined);

    return run;
  }

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

    let data: unknown;

    try {
      data = z.decode(registration.definition.dataSchema, task.data);
    } catch (err) {
      await this.failTaskWithoutExecutions(task, err);

      return true;
    }

    const typedTask: Task = { ...task, data };

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

    const outcomes: TaskExecutionOutcome[] = [];

    for (const execution of executions) {
      if (execution.state === 'completed' || execution.state === 'failed') {
        continue;
      }

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

    this.deliverOutcome(task.id, state, outcomes);

    await this.consensusService.advanceLastAppliedSequence(task.sequence);

    return true;
  }

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
}

/* exports */

export { TaskApplyHandler };
export type { TaskApplyHandlerContract };
