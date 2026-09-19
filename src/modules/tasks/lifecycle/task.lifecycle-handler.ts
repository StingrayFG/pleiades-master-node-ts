import { TaskPayloadCleanupHandler } from './task-payload-cleanup.handler';

/* contract */

type TaskLifecycleHandlerContract = {
  run(): Promise<void>;
};

/* handler */

class TaskLifecycleHandler implements TaskLifecycleHandlerContract {
  constructor(private readonly taskPayloadCleanupHandler: TaskPayloadCleanupHandler) {}

  async run(): Promise<void> {
    await this.taskPayloadCleanupHandler.run(new Date());
  }
}

/* exports */

export { TaskLifecycleHandler };
export type { TaskLifecycleHandlerContract };
