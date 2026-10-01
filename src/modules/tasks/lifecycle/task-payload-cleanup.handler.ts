import { GenericInternalServerError } from '@/errors/application.errors';
import { createAggregateErrorCause, type ErrorCauseEntry } from '@/errors/error.causes';
import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';

import type { ListPayloadCleanupCandidatesRepositoryInput } from '../task.application';
import type { TaskConfig } from '../task.config';
import type { PersistedTask } from '../task.domain';
import type { TaskRepositoryContract } from '../task.repository';

/* handler */

class TaskPayloadCleanupHandler {
  constructor(
    private readonly repository: TaskRepositoryContract,
    private readonly byteStorageService: ByteStorageServiceContract,
    private readonly taskConfig: TaskConfig
  ) {}

  async run(now: Date): Promise<void> {
    const updatedBefore = new Date(now.getTime() - this.taskConfig.lifecycle.payloadCleanup.afterMs);

    const listCandidatesInput: ListPayloadCleanupCandidatesRepositoryInput = {
      updatedBefore,
      limit: this.taskConfig.lifecycle.payloadCleanup.batchSize
    };

    const tasks = await this.repository.listPayloadCleanupCandidates(listCandidatesInput);

    const results = await Promise.allSettled(tasks.map((task) => this.cleanupPayload(task)));

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

      throw new GenericInternalServerError('Task payload cleanup failed', { cause });
    }
  }

  private async cleanupPayload(task: PersistedTask): Promise<void> {
    if (task.state === 'pending' || task.payloadId === null) {
      return;
    }

    // delete the payload first: a crash here keeps the reference, so the next sweep retries
    await this.byteStorageService.delete(task.payloadId);

    await this.repository.clearPayloadId({
      id: task.id,
      revision: task.revision
    });
  }
}

/* exports */

export { TaskPayloadCleanupHandler };
