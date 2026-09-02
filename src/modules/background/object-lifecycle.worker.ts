import type { FastifyBaseLogger } from 'fastify';

import type { ObjectLifecycleHandlerContract } from '@/modules/objects/lifecycle/object.lifecycle-handler';

/* constants */

const OBJECT_LIFECYCLE_INTERVAL_MS = 60_000;

/* worker */

class ObjectLifecycleWorker {
  private timer: NodeJS.Timeout | null = null;
  private runPromise: Promise<void> | null = null;

  constructor(
    private readonly lifecycleHandler: ObjectLifecycleHandlerContract,
    private readonly logger: FastifyBaseLogger
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }

    this.run();

    this.timer = setInterval(() => {
      this.run();
    }, OBJECT_LIFECYCLE_INTERVAL_MS);
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
        this.logger.error({ err }, 'Object lifecycle sweep failed');
      })
      .finally(() => {
        this.runPromise = null;
      });
  }
}

/* exports */

export { ObjectLifecycleWorker };
