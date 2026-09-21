import type { MasterNode as PrismaMasterNode } from '@prisma/client';
import { describe, expect, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';

import type { MasterNode } from '../master-node.domain';
import { mapPrismaMasterNodeToDomainMasterNode } from '../master-node.mappers';

/* fixtures */

const prismaMasterNode: PrismaMasterNode = {
  id: 'master-node-012345abcdef',

  certificate_fingerprint: 'ab'.repeat(32),
  session_id: '00000000-0000-4000-8000-000000000001',
  state: 'active',
  mode: 'serving',

  hostname: 'master-node.internal',
  port: 50051,
  scheme: 'grpcs',

  registered_at: new Date('2026-01-01T00:00:00.000Z'),
  last_contact_at: new Date('2026-01-02T00:00:00.000Z'),
  last_health_check_at: new Date('2026-01-02T00:01:00.000Z'),
  last_heartbeat_at: new Date('2026-01-02T00:02:00.000Z'),
  updated_at: new Date('2026-01-02T00:02:00.000Z'),

  revision: 2n
};

const domainMasterNode: MasterNode = {
  id: prismaMasterNode.id,

  certificateFingerprint: prismaMasterNode.certificate_fingerprint,
  sessionId: prismaMasterNode.session_id,
  state: prismaMasterNode.state,
  mode: prismaMasterNode.mode,

  hostname: prismaMasterNode.hostname,
  port: prismaMasterNode.port,
  scheme: 'grpcs',

  registeredAt: prismaMasterNode.registered_at,
  lastContactAt: prismaMasterNode.last_contact_at,
  lastHealthCheckAt: prismaMasterNode.last_health_check_at,
  lastHeartbeatAt: prismaMasterNode.last_heartbeat_at,
  updatedAt: prismaMasterNode.updated_at,

  revision: prismaMasterNode.revision
};

/* tests */

describe('master node mappers', () => {
  test('maps a Prisma master node to the domain entity', () => {
    expect(mapPrismaMasterNodeToDomainMasterNode(prismaMasterNode)).toEqual(domainMasterNode);
  });

  test('wraps invalid Prisma data in a mapper error', () => {
    const invalidMasterNode = {
      ...prismaMasterNode,
      port: 0
    };

    expect(() => mapPrismaMasterNodeToDomainMasterNode(invalidMasterNode)).toThrow(GenericMapperError);
  });
});
