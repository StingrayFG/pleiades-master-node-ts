/* imports */

import type { BackgroundWorkerContract } from './background-worker.contract';

/* worker */

class IntervalBackgroundWorker implements BackgroundWorkerContract {
  private interval: NodeJS.Timeout | null = null;
  private runPromise: Promise<void> | null = null;

  constructor(
    private readonly intervalMs: number,
    private readonly handler: () => Promise<void>
  ) {}

  start(): void {
    if (this.interval) {
      return;
    }

    void this.run();

    this.interval = setInterval(() => {
      void this.run();
    }, this.intervalMs);
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }

    if (this.runPromise) {
      await this.runPromise;
    }
  }

  async run(): Promise<void> {
    if (this.runPromise) {
      return;
    }

    this.runPromise = this.execute();

    try {
      await this.runPromise;
    } finally {
      this.runPromise = null;
    }
  }

  private async execute(): Promise<void> {
    await this.handler();
  }
}

/* exports */

export { IntervalBackgroundWorker };
