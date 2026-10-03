import { InternodeApplicationError, InternodeNotFoundError } from '@/errors/internode.errors';

import type { BlobServiceContract } from '@/modules/blobs/blob.service';
import { mapDataNodeToDataNodeEndpoint } from '@/modules/data-nodes/data-node.mappers';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import type { PartConfig } from '../object-version-part.config';
import type { PartReplica } from '../object-version-part.domain';
import type { ObjectVersionPartRepositoryContract } from '../object-version-part.repository';

/* handler */

class PartReplicaDeletionHandler {
  constructor(
    private readonly repository: ObjectVersionPartRepositoryContract,
    private readonly dataNodeService: DataNodeServiceContract,
    private readonly blobService: BlobServiceContract,
    private readonly partConfig: PartConfig
  ) {}

  async run(now: Date): Promise<void> {
    const updatedBefore = new Date(now.getTime() - this.partConfig.lifecycle.deletion.afterMs);

    const partReplicas = await this.repository.listPartReplicaDeletionCandidates({
      updatedBefore,
      limit: this.partConfig.lifecycle.deletion.batchSize
    });

    await Promise.all(partReplicas.map((partReplica) => this.deletePartReplica(partReplica)));
  }

  private async deletePartReplica(partReplica: PartReplica): Promise<void> {
    if (partReplica.state !== 'deleting') {
      return;
    }

    const dataNode = await this.dataNodeService.getDataNodeById(partReplica.dataNodeId);

    if (dataNode.state !== 'active') {
      await this.touchDeletionCandidate(partReplica);
      return;
    }

    try {
      await this.blobService.deleteBlob({
        blobId: partReplica.blobId,

        dataNodeEndpoint: mapDataNodeToDataNodeEndpoint(dataNode)
      });
    } catch (err) {
      if (!(err instanceof InternodeApplicationError)) {
        throw err;
      }

      if (!(err instanceof InternodeNotFoundError)) {
        await this.touchDeletionCandidate(partReplica);
        return;
      }
    }

    await this.repository.deletePartReplicaIfDeleting({
      blobId: partReplica.blobId,
      dataNodeId: partReplica.dataNodeId
    });
  }

  private async touchDeletionCandidate(partReplica: PartReplica): Promise<void> {
    await this.repository.touchPartReplicaDeletionCandidate({
      blobId: partReplica.blobId,
      dataNodeId: partReplica.dataNodeId
    });
  }
}

/* exports */

export { PartReplicaDeletionHandler };
