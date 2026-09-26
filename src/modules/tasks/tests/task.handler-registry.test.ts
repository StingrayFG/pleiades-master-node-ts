import { describe, expect, jest, test } from '@jest/globals';
import { z } from 'zod';

import { GenericConflictError, GenericNotFoundError } from '@/errors/application.errors';

import { createTaskDefinition } from '../task.definition';
import { InMemoryTaskHandlerRegistry } from '../task.handler-registry';

/* fixtures */

const definition = createTaskDefinition({
  type: 'test.execute',
  dataSchema: z.object({ value: z.string() }),
  executionScope: 'local',
  resultSchema: z.string()
});

/* tests */

describe('InMemoryTaskHandlerRegistry', () => {
  test('registers and resolves a handler by definition and type', () => {
    const registry = new InMemoryTaskHandlerRegistry();
    const handler = jest.fn(async () => 'result');

    registry.register(definition, handler);

    expect(registry.resolve(definition)).toBe(handler);
    expect(registry.resolveByType(definition.type)).toEqual({ definition, handler });
  });

  test('rejects duplicate handler registration for a task type', () => {
    const registry = new InMemoryTaskHandlerRegistry();
    const handler = jest.fn(async () => 'result');

    registry.register(definition, handler);

    expect(() => registry.register(definition, handler)).toThrow(GenericConflictError);
  });

  test('rejects a different definition object registered under the same type', () => {
    const registry = new InMemoryTaskHandlerRegistry();
    const equivalentDefinition = createTaskDefinition({
      type: 'test.execute',
      dataSchema: z.object({ value: z.string() }),
      executionScope: 'local',
      resultSchema: z.string()
    });

    registry.register(
      definition,
      jest.fn(async () => 'result')
    );

    expect(() => registry.resolve(equivalentDefinition)).toThrow(GenericConflictError);
  });

  test('rejects resolution for an unregistered task type', () => {
    const registry = new InMemoryTaskHandlerRegistry();

    expect(() => registry.resolveByType(definition.type)).toThrow(GenericNotFoundError);
  });
});
