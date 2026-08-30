import type { FastifyBaseLogger } from 'fastify';

import type { DataNodeLifecycleHandlerContract } from '@/modules/data-nodes/data-node.lifecycle-handler';

const DATA_NODE_LIFECYCLE_INTERVAL_MS = 60_000;

/* worker */

class DataNodeLifecycleWorker {
  private timer: NodeJS.Timeout | null = null;
  private runPromise: Promise<void> | null = null;

  constructor(
    private readonly lifecycleHandler: DataNodeLifecycleHandlerContract,
    private readonly logger: FastifyBaseLogger
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }

    this.run();

    this.timer = setInterval(() => {
      this.run();
    }, DATA_NODE_LIFECYCLE_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    await this.runPromise;
  }

  private run(): void {
    if (this.runPromise) {
      return;
    }

    this.runPromise = this.lifecycleHandler
      .run()
      .catch((err) => {
        this.logger.error({ err }, 'Data node lifecycle sweep failed');
      })
      .finally(() => {
        this.runPromise = null;
      });
  }
}

/* exports */

export { DataNodeLifecycleWorker };
