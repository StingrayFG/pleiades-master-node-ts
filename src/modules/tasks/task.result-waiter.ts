import { GenericDeadlineExceededError } from '@/errors/application.errors';

import type { TaskId } from './task.domain';

/* contract */

type TaskResultWaiterContract = {
  wait<TResult>(id: TaskId, timeoutMs: number): Promise<TResult>;
  deliver(id: TaskId, result: unknown): void;
  fail(id: TaskId, error: unknown): void;
};

/* waiter */

class TaskResultWaiter implements TaskResultWaiterContract {
  private readonly waiters = new Map<
    TaskId,
    {
      timeout: NodeJS.Timeout;
      resolve: (result: unknown) => void;
      reject: (error: unknown) => void;
    }
  >();

  wait<TResult>(id: TaskId, timeoutMs: number): Promise<TResult> {
    this.clear(id);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters.delete(id);
        reject(new GenericDeadlineExceededError('Timed out waiting for task execution'));
      }, timeoutMs);

      this.waiters.set(id, {
        timeout,
        resolve: (result) => {
          clearTimeout(timeout);
          this.waiters.delete(id);
          resolve(result as TResult);
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.waiters.delete(id);
          reject(error);
        }
      });
    });
  }

  deliver(id: TaskId, result: unknown): void {
    this.waiters.get(id)?.resolve(result);
  }

  fail(id: TaskId, error: unknown): void {
    this.waiters.get(id)?.reject(error);
  }

  private clear(id: TaskId): void {
    const existing = this.waiters.get(id);

    if (existing) {
      clearTimeout(existing.timeout);
      this.waiters.delete(id);
    }
  }
}

/* exports */

export { TaskResultWaiter };
export type { TaskResultWaiterContract };
