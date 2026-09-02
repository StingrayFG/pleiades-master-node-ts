import { DeletingObjectVersionCleanupHandler } from './deleting-object-version-cleanup.handler';
import { PendingObjectVersionCleanupHandler } from './pending-object-version-cleanup.handler';

/* contract */

type ObjectLifecycleHandlerContract = {
  run(): Promise<void>;
};

/* handler */

class ObjectLifecycleHandler implements ObjectLifecycleHandlerContract {
  constructor(
    private readonly pendingObjectVersionCleanupHandler: PendingObjectVersionCleanupHandler,
    private readonly deletingObjectVersionCleanupHandler: DeletingObjectVersionCleanupHandler
  ) {}

  async run(): Promise<void> {
    const now = new Date();

    await Promise.all([
      this.pendingObjectVersionCleanupHandler.run(now),
      this.deletingObjectVersionCleanupHandler.run()
    ]);
  }
}

/* exports */

export { ObjectLifecycleHandler };
export type { ObjectLifecycleHandlerContract };
