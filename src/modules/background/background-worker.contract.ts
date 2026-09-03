/* contract */

type BackgroundWorkerContract = {
  start(): void;
  stop(): Promise<void>;
  run(): Promise<void>;
};

/* exports */

export type { BackgroundWorkerContract };
