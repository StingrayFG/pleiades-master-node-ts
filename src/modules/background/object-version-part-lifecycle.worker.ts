import type { FastifyBaseLogger } from 'fastify';

import type { ObjectVersionPartLifecycleHandlerContract } from '@/modules/object-version-parts/lifecycle/object-version-part.lifecycle-handler';

/* constants */

const OBJECT_VERSION_PART_LIFECYCLE_INTERVAL_MS = 60_000;

/* worker */

class ObjectVersionPartLifecycleWorker {
  private timer: NodeJS.Timeout | null = null;
  private runPromise: Promise<void> | null = null;

  constructor(
    private readonly lifecycleHandler: ObjectVersionPartLifecycleHandlerContract,
    private readonly logger: FastifyBaseLogger
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }

    this.run();

    this.timer = setInterval(() => {
      this.run();
    }, OBJECT_VERSION_PART_LIFECYCLE_INTERVAL_MS);
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
        this.logger.error({ err }, 'Object version part lifecycle sweep failed');
      })
      .finally(() => {
        this.runPromise = null;
      });
  }
}

/* exports */

export { ObjectVersionPartLifecycleWorker };
