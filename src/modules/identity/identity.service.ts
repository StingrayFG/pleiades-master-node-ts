import { randomBytes, randomUUID } from 'node:crypto';

import { GenericInternalServerError } from '@/errors/application.errors';

import { NODE_ID_PREFIX, nodeIdSchema, nodeSessionIdSchema, type NodeId, type NodeSessionId } from './identity.domain';
import type { IdentityRepositoryContract } from './identity.repository';

/* constants */

const NODE_ID_RANDOM_SIZE_BYTES = 6;

/* contract */

type IdentityServiceContract = {
  getNodeId(): NodeId;
  getNodeSessionId(): NodeSessionId;
};

/* service */

class IdentityService implements IdentityServiceContract {
  private nodeId: NodeId | null = null;
  private readonly nodeSessionId = nodeSessionIdSchema.parse(randomUUID());

  constructor(private readonly repository: IdentityRepositoryContract) {}

  /* public methods */

  getNodeId(): NodeId {
    if (this.nodeId) {
      return this.nodeId;
    }

    const existingNodeId = this.repository.findNodeId();

    if (existingNodeId) {
      this.nodeId = existingNodeId;

      return existingNodeId;
    }

    const nodeId = this.generateNodeId();

    if (this.repository.createNodeId(nodeId)) {
      this.nodeId = nodeId;

      return nodeId;
    }

    // another process won the creation race, so use the node ID it persisted
    const concurrentlyCreatedNodeId = this.repository.findNodeId();

    if (!concurrentlyCreatedNodeId) {
      throw new GenericInternalServerError('The node ID file was created concurrently but could not be read');
    }

    this.nodeId = concurrentlyCreatedNodeId;

    return concurrentlyCreatedNodeId;
  }

  getNodeSessionId(): NodeSessionId {
    return this.nodeSessionId;
  }

  /* private methods */

  private generateNodeId(): NodeId {
    let randomIdPart;

    try {
      randomIdPart = randomBytes(NODE_ID_RANDOM_SIZE_BYTES).toString('hex');
    } catch (err) {
      throw new GenericInternalServerError('Failed to generate the node ID', { cause: err });
    }

    return nodeIdSchema.parse(`${NODE_ID_PREFIX}-${randomIdPart}`);
  }
}

/* exports */

export { IdentityService };
export type { IdentityServiceContract };
