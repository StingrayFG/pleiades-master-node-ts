import { GenericInternalServerError } from '@/errors/application.errors';
import { createAggregateErrorCause, type ErrorCauseEntry } from '@/errors/error-causes';

import { TaskPayloadCleanupHandler } from './task-payload-cleanup.handler';
import { UncommittedTaskCleanupHandler } from './uncommitted-task-cleanup.handler';

/* contract */

type TaskLifecycleHandlerContract = {
  run(): Promise<void>;
};

/* handler */

class TaskLifecycleHandler implements TaskLifecycleHandlerContract {
  constructor(
    private readonly uncommittedTaskCleanupHandler: UncommittedTaskCleanupHandler,
    private readonly taskPayloadCleanupHandler: TaskPayloadCleanupHandler
  ) {}

  async run(): Promise<void> {
    const now = new Date();

    const results = await Promise.allSettled([
      this.uncommittedTaskCleanupHandler.run(now),
      this.taskPayloadCleanupHandler.run(now)
    ]);

    const errors: ErrorCauseEntry[] = [];

    const sources = ['uncommittedCleanup', 'payloadCleanup'] as const;

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];

      if (result.status === 'rejected') {
        errors.push({
          source: sources[index],
          error: result.reason
        });
      }
    }

    if (errors.length > 0) {
      const cause = createAggregateErrorCause(errors);

      throw new GenericInternalServerError('Task lifecycle execution failed', { cause });
    }
  }
}

/* exports */

export { TaskLifecycleHandler };
export type { TaskLifecycleHandlerContract };
