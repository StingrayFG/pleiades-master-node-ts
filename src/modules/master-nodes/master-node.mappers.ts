import type { MasterNode as PrismaMasterNode } from '@prisma/client';

import { withMapperError } from '@/common/mappers/mappers';

import { masterNodeSchema, type MasterNode } from './master-node.domain';

/* prisma -> domain */

export const mapPrismaMasterNodeToDomainMasterNode = (masterNode: PrismaMasterNode): MasterNode => {
  return withMapperError('Failed to map Prisma master node to domain master node', () => {
    return masterNodeSchema.parse({
      id: masterNode.id,

      certificateFingerprint: masterNode.certificate_fingerprint,
      sessionId: masterNode.session_id,
      state: masterNode.state,
      mode: masterNode.mode,

      hostname: masterNode.hostname,
      port: masterNode.port,
      scheme: masterNode.scheme,

      registeredAt: masterNode.registered_at,
      lastContactAt: masterNode.last_contact_at,
      lastHealthCheckAt: masterNode.last_health_check_at,
      lastHeartbeatAt: masterNode.last_heartbeat_at,
      updatedAt: masterNode.updated_at,

      revision: masterNode.revision
    });
  });
};
