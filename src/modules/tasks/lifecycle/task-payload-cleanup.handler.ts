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

    await Promise.all(tasks.map((task) => this.cleanupPayload(task)));
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
