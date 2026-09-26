import { Buffer } from 'node:buffer';

import { describe, expect, test } from '@jest/globals';
import { z } from 'zod';

import { createDehydratedTaskDefinition, createTaskDefinition, isDehydratedTaskDefinition } from '../task.definition';

/* tests */

describe('task definitions', () => {
  test('creates a simple definition with matching persisted data and task schemas', () => {
    const dataSchema = z.object({ value: z.string() });
    const definition = createTaskDefinition({
      type: 'test.simple',
      dataSchema,
      executionScope: 'local'
    });

    expect(definition.persistedDataSchema).toBe(dataSchema);
    expect(isDehydratedTaskDefinition(definition)).toBe(false);
    expect(
      definition.taskSchema.parse({
        id: '00000000-0000-4000-8000-000000000001',
        originMasterNodeId: 'master-node-test',
        epoch: 1n,
        sequence: 2n,
        state: 'pending',
        revision: 0n,
        type: 'test.simple',
        data: { value: 'test' },
        executionScope: 'local'
      })
    ).toMatchObject({ type: 'test.simple', data: { value: 'test' }, executionScope: 'local' });
  });

  test('creates a dehydrated definition that splits and restores payload data', () => {
    const definition = createDehydratedTaskDefinition({
      type: 'test.dehydrated',
      dataSchema: z.object({ name: z.string(), bytes: z.instanceof(Buffer) }),
      persistedDataSchema: z.object({ name: z.string() }),
      executionScope: 'cluster',
      dehydrateData: ({ name, bytes }) => ({ data: { name }, payload: bytes }),
      hydrateData: (data, payload) => ({ ...data, bytes: payload })
    });
    const bytes = Buffer.from('payload');

    expect(isDehydratedTaskDefinition(definition)).toBe(true);
    expect(definition.dehydrateData({ name: 'test', bytes })).toEqual({ data: { name: 'test' }, payload: bytes });
    expect(definition.hydrateData({ name: 'test' }, bytes)).toEqual({ name: 'test', bytes });
  });

  test('rejects task values with a mismatched type or execution scope', () => {
    const definition = createTaskDefinition({
      type: 'test.simple',
      dataSchema: z.object({ value: z.string() }),
      executionScope: 'local'
    });
    const task = {
      id: '00000000-0000-4000-8000-000000000001',
      originMasterNodeId: 'master-node-test',
      epoch: 1n,
      sequence: 2n,
      state: 'pending',
      revision: 0n,
      type: 'test.simple',
      data: { value: 'test' },
      executionScope: 'local'
    };

    expect(definition.taskSchema.safeParse({ ...task, type: 'other' }).success).toBe(false);
    expect(definition.taskSchema.safeParse({ ...task, executionScope: 'cluster' }).success).toBe(false);
  });
});
