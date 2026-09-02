import { GenericInternalServerError } from '@/errors/application.errors';
import { InternodeApplicationError } from '@/errors/internode.errors';

import type { BlobServiceContract } from '@/modules/blobs/blob.service';
import { mapDataNodeToDataNodeEndpoint } from '@/modules/data-nodes/data-node.mappers';
import type { DataNodeServiceContract } from '@/modules/data-nodes/data-node.service';

import type {
  ApplyPartReplicaVerificationRepositoryInput,
  ListPartReplicaVerificationCandidatesRepositoryInput,
  TouchPartReplicaVerificationCandidateRepositoryInput
} from '../object-version-part.application';
import type { PartConfig } from '../object-version-part.config';
import type { PartReplica, PartReplicaState } from '../object-version-part.domain';
import { resolveFailedGetPartReplicaState } from '../object-version-part.replica-state-resolvers';
import type { ObjectVersionPartRepositoryContract } from '../object-version-part.repository';
import { verifyPartBlob } from '../object-version-part.verifiers';

/* handler */

class PartReplicaVerificationHandler {
  constructor(
    private readonly repository: ObjectVersionPartRepositoryContract,
    private readonly dataNodeService: DataNodeServiceContract,
    private readonly blobService: BlobServiceContract,
    private readonly partConfig: PartConfig
  ) {}

  async run(now: Date): Promise<void> {
    const verifiedBefore = new Date(now.getTime() - this.partConfig.lifecycle.verification.afterMs);

    const listVerificationCandidatesInput: ListPartReplicaVerificationCandidatesRepositoryInput = {
      verifiedBefore,
      limit: this.partConfig.lifecycle.verification.batchSize
    };

    const partReplicas = await this.repository.listPartReplicaVerificationCandidates(listVerificationCandidatesInput);

    await Promise.all(partReplicas.map((partReplica) => this.verifyCommittedPartReplica(partReplica, now)));
  }

  private async verifyCommittedPartReplica(partReplica: PartReplica, verifiedAt: Date): Promise<void> {
    const part = await this.repository.findPartByBlobId(partReplica.blobId);

    if (!part) {
      throw new GenericInternalServerError('Part replica references a missing object version part');
    }

    const dataNode = await this.dataNodeService.getDataNodeById(partReplica.dataNodeId);

    if (dataNode.state !== 'active') {
      await this.touchVerificationCandidate(partReplica);
      return;
    }

    let state: PartReplicaState = 'committed';
    let successfulVerification = false;

    try {
      const blobMetadata = await this.blobService.verifyBlob({
        blobId: part.blobId,
        dataNodeEndpoint: mapDataNodeToDataNodeEndpoint(dataNode)
      });

      verifyPartBlob(part, blobMetadata);

      successfulVerification = true;
    } catch (err) {
      if (!(err instanceof InternodeApplicationError)) {
        throw err;
      }

      const failedState = resolveFailedGetPartReplicaState(err);

      if (failedState === null) {
        await this.touchVerificationCandidate(partReplica);
        return;
      }

      state = failedState;
    }

    const verificationInput: ApplyPartReplicaVerificationRepositoryInput = {
      blobId: partReplica.blobId,
      dataNodeId: partReplica.dataNodeId,

      state,

      ...(successfulVerification
        ? {
            verifiedAt
          }
        : {})
    };

    await this.repository.applyPartReplicaVerification(verificationInput);
  }

  private async touchVerificationCandidate(partReplica: PartReplica): Promise<void> {
    const touchVerificationCandidateInput: TouchPartReplicaVerificationCandidateRepositoryInput = {
      blobId: partReplica.blobId,
      dataNodeId: partReplica.dataNodeId
    };

    await this.repository.touchPartReplicaVerificationCandidate(touchVerificationCandidateInput);
  }
}

/* exports */

export { PartReplicaVerificationHandler };
