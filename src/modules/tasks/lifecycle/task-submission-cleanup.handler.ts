import { GenericInternalServerError } from '@/errors/application.errors';
import { createAggregateErrorCause, type ErrorCauseEntry } from '@/errors/error.causes';
import type { ByteStorageServiceContract } from '@/modules/byte-storage/byte-storage.service';

import type { TaskConfig } from '../task.config';
import type { TaskSubmission } from '../task.domain';
import type { TaskRepositoryContract } from '../task.repository';

/* handler */

class TaskSubmissionCleanupHandler {
  constructor(
    private readonly repository: TaskRepositoryContract,
    private readonly byteStorageService: ByteStorageServiceContract,
    private readonly taskConfig: TaskConfig
  ) {}

  async run(now: Date): Promise<void> {
    const updatedBefore = new Date(now.getTime() - this.taskConfig.lifecycle.submissionCleanup.afterMs);

    const submissions = await this.repository.listSubmissionCleanupCandidates({
      updatedBefore,
      limit: this.taskConfig.lifecycle.submissionCleanup.batchSize
    });

    const results = await Promise.allSettled(submissions.map((submission) => this.cleanupSubmission(submission, now)));

    const errors: ErrorCauseEntry[] = [];

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];

      if (result.status === 'rejected') {
        errors.push({
          source: submissions[index].id,
          error: result.reason
        });
      }
    }

    if (errors.length > 0) {
      const cause = createAggregateErrorCause(errors);

      throw new GenericInternalServerError('Task submission cleanup failed', { cause });
    }
  }

  private async cleanupSubmission(submission: TaskSubmission, now: Date): Promise<void> {
    if (submission.state === 'pending') {
      const transitioned = await this.repository.transitionSubmissionState({
        id: submission.id,
        revision: submission.revision,
        from: 'pending',
        to: 'deleting',
        at: now
      });

      if (!transitioned) {
        return;
      }
    }

    if (submission.payloadId !== null) {
      await this.byteStorageService.delete(submission.payloadId);
    }

    await this.repository.deleteSubmission({
      id: submission.id,
      state: 'deleting'
    });
  }
}

/* exports */

export { TaskSubmissionCleanupHandler };
