import { describe, expect, test } from '@jest/globals';

import { nodeIdSchema, nodeSessionIdSchema } from '../identity.domain';

/* tests */

describe('identity domain schemas', () => {
  test('accepts a master node ID with a 12-character lowercase hexadecimal suffix', () => {
    expect(nodeIdSchema.parse('master-node-012345abcdef')).toBe('master-node-012345abcdef');
  });

  test.each([
    'master-node-012345abcde',
    'master-node-012345abcdef0',
    'master-node-012345ABCDEf',
    'master-node-012345abcdeg',
    'data-node-012345abcdef',
    'master-node_012345abcdef',
    'master-node-012345abcdef/extra',
    ' master-node-012345abcdef'
  ])('rejects invalid node ID %j', (nodeId) => {
    expect(nodeIdSchema.safeParse(nodeId).success).toBe(false);
  });

  test('accepts UUID session IDs', () => {
    const sessionId = '00000000-0000-4000-8000-000000000001';

    expect(nodeSessionIdSchema.parse(sessionId)).toBe(sessionId);
  });

  test.each(['not-a-uuid', '00000000-0000-0000-0000-000000000001'])('rejects invalid session ID %j', (sessionId) => {
    expect(nodeSessionIdSchema.safeParse(sessionId).success).toBe(false);
  });
});
