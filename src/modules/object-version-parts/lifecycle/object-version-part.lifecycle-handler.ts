import { GenericInternalServerError } from '@/errors/application.errors';
import { createAggregateErrorCause, type ErrorCauseEntry } from '@/errors/error-causes';

import { PartReplicaDeletionHandler } from './part-replica-deletion.handler';
import { PartReplicaRepairHandler } from './part-replica-repair.handler';
import { PartReplicaVerificationHandler } from './part-replica-verification.handler';
import { PendingPartReplicaReconciliationHandler } from './pending-part-replica-reconciliation.handler';

/* contract */

type ObjectVersionPartLifecycleHandlerContract = {
  run(): Promise<void>;
};

/* handler */

class ObjectVersionPartLifecycleHandler implements ObjectVersionPartLifecycleHandlerContract {
  constructor(
    private readonly partReplicaVerificationHandler: PartReplicaVerificationHandler,
    private readonly pendingPartReplicaReconciliationHandler: PendingPartReplicaReconciliationHandler,
    private readonly partReplicaRepairHandler: PartReplicaRepairHandler,
    private readonly partReplicaDeletionHandler: PartReplicaDeletionHandler
  ) {}

  async run(): Promise<void> {
    const now = new Date();

    const results = await Promise.allSettled([
      this.partReplicaVerificationHandler.run(now),
      this.pendingPartReplicaReconciliationHandler.run(now),
      this.partReplicaRepairHandler.run(now),
      this.partReplicaDeletionHandler.run(now)
    ]);

    const errors: ErrorCauseEntry[] = [];

    const sources = ['verification', 'reconciliation', 'repair', 'deletion'] as const;

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

      throw new GenericInternalServerError('Object version part lifecycle execution failed', { cause });
    }
  }
}

/* exports */

export { ObjectVersionPartLifecycleHandler };
export type { ObjectVersionPartLifecycleHandlerContract };
