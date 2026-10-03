import { GenericAbortedError, GenericInternalServerError } from '@/errors/application.errors';
import { createAggregateErrorCause, type ErrorCauseEntry } from '@/errors/error.causes';
import type { ConsensusServiceContract } from '@/modules/consensus/consensus.service';

import type { ListUncommittedCleanupCandidatesRepositoryInput } from '../task.application';
import type { TaskConfig } from '../task.config';
import type { PersistedTask } from '../task.domain';
import type { TaskRepositoryContract } from '../task.repository';

/* handler */

class UncommittedTaskCleanupHandler {
  constructor(
    private readonly repository: TaskRepositoryContract,
    private readonly consensusService: ConsensusServiceContract,
    private readonly taskConfig: TaskConfig
  ) {}

  async run(now: Date): Promise<void> {
    const consensusState = await this.consensusService.getConsensusState();

    const updatedBefore = new Date(now.getTime() - this.taskConfig.lifecycle.uncommittedCleanup.afterMs);

    const listCandidatesInput: ListUncommittedCleanupCandidatesRepositoryInput = {
      afterSequence: consensusState.lastCommittedSequence,
      updatedBefore,
      limit: this.taskConfig.lifecycle.uncommittedCleanup.batchSize
    };

    const tasks = await this.repository.listUncommittedCleanupCandidates(listCandidatesInput);

    const results = await Promise.allSettled(tasks.map((task) => this.failTask(task, now)));

    const errors: ErrorCauseEntry[] = [];

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];

      if (result.status === 'rejected') {
        errors.push({
          source: tasks[index].id,
          error: result.reason
        });
      }
    }

    if (errors.length > 0) {
      const cause = createAggregateErrorCause(errors);

      throw new GenericInternalServerError('Uncommitted task cleanup failed', { cause });
    }
  }

  private async failTask(task: PersistedTask, now: Date): Promise<void> {
    if (task.state !== 'pending') {
      return;
    }

    try {
      await this.repository.updateTaskState({
        id: task.id,
        revision: task.revision,
        state: 'failed',
        at: now
      });
    } catch (err) {
      if (!(err instanceof GenericAbortedError)) {
        throw err;
      }
    }
  }
}

/* exports */

export { UncommittedTaskCleanupHandler };
