import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericDeadlineExceededError } from '@/errors/application.errors';

import { TaskResultWaiter } from '../task.result-waiter';

/* fixtures */

const taskId = '00000000-0000-4000-8000-000000000001';

/* tests */

describe('TaskResultWaiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('delivers a result to a waiting task execution', async () => {
    const waiter = new TaskResultWaiter();
    const resultPromise = waiter.wait<string>(taskId, 1_000);

    waiter.deliver(taskId, 'result');

    await expect(resultPromise).resolves.toBe('result');
  });

  test('delivers a failure to a waiting task execution', async () => {
    const waiter = new TaskResultWaiter();
    const error = new Error('execution failed');
    const resultPromise = waiter.wait(taskId, 1_000);

    waiter.fail(taskId, error);

    await expect(resultPromise).rejects.toBe(error);
  });

  test('rejects when task execution exceeds its timeout', async () => {
    const waiter = new TaskResultWaiter();
    const resultPromise = waiter.wait(taskId, 1_000);
    const expectation = expect(resultPromise).rejects.toBeInstanceOf(GenericDeadlineExceededError);

    await jest.advanceTimersByTimeAsync(1_000);

    await expectation;
  });

  test('ignores results and failures for tasks without waiters', () => {
    const waiter = new TaskResultWaiter();

    expect(() => waiter.deliver(taskId, 'result')).not.toThrow();
    expect(() => waiter.fail(taskId, new Error('failed'))).not.toThrow();
  });
});
