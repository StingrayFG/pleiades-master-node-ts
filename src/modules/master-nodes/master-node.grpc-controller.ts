import { Buffer } from 'node:buffer';

import type { sendUnaryData, ServerUnaryCall } from '@grpc/grpc-js';

import { GenericBadRequestError, GenericMapperError } from '@/errors/application.errors';
import type {
  FetchMasterInfoRequest,
  FetchMasterInfoResponse,
  RegisterMasterNodeRequest,
  RegisterMasterNodeResponse,
  FetchClusterMembershipSnapshotRequest,
  FetchClusterMembershipSnapshotResponse,
  FetchTaskEntriesRequest,
  FetchTaskEntriesResponse,
  FetchTaskPayloadRequest,
  FetchTaskPayloadResponse,
  ForwardTaskRequest,
  ForwardTaskResponse,
  RequestVoteRequest,
  RequestVoteResponse,
  RecordLeaderHeartbeatRequest,
  RecordLeaderHeartbeatResponse
} from '@/gen/proto/master/v1/master';
import { serializeClusterMembershipSnapshot } from '@/modules/cluster/cluster.membership-snapshot.serializer';
import { getGrpcPeerCertificateFingerprint } from '@/transports/grpc/server/auth/grpc-peer-auth';

import type { MasterNodeInternodeServiceContract } from './master-node.internode-service';
import {
  mapGrpcRegisterMasterNodeRequestToRegisterMasterNodeInternodeInput,
  mapGrpcFetchClusterMembershipSnapshotRequestToFetchClusterMembershipSnapshotInternodeInput,
  mapGrpcFetchTaskEntriesRequestToFetchTaskEntriesInternodeInput,
  mapInternodeTaskEntryToGrpcTaskEntry,
  mapGrpcFetchTaskPayloadRequestToFetchTaskPayloadInternodeInput,
  mapGrpcForwardTaskRequestToForwardTaskInternodeInput,
  mapGrpcRequestVoteRequestToRequestVoteInternodeInput,
  mapGrpcRecordLeaderHeartbeatRequestToRecordLeaderHeartbeatInternodeInput
} from './master-node.mappers';

/* contract */

type MasterNodeGrpcControllerContract = {
  fetchMasterInfo(
    call: ServerUnaryCall<FetchMasterInfoRequest, FetchMasterInfoResponse>,
    callback: sendUnaryData<FetchMasterInfoResponse>
  ): Promise<void>;
  registerMasterNode(
    call: ServerUnaryCall<RegisterMasterNodeRequest, RegisterMasterNodeResponse>,
    callback: sendUnaryData<RegisterMasterNodeResponse>
  ): Promise<void>;
  fetchClusterMembershipSnapshot(
    call: ServerUnaryCall<FetchClusterMembershipSnapshotRequest, FetchClusterMembershipSnapshotResponse>,
    callback: sendUnaryData<FetchClusterMembershipSnapshotResponse>
  ): Promise<void>;
  fetchTaskEntries(
    call: ServerUnaryCall<FetchTaskEntriesRequest, FetchTaskEntriesResponse>,
    callback: sendUnaryData<FetchTaskEntriesResponse>
  ): Promise<void>;
  fetchTaskPayload(
    call: ServerUnaryCall<FetchTaskPayloadRequest, FetchTaskPayloadResponse>,
    callback: sendUnaryData<FetchTaskPayloadResponse>
  ): Promise<void>;
  forwardTask(
    call: ServerUnaryCall<ForwardTaskRequest, ForwardTaskResponse>,
    callback: sendUnaryData<ForwardTaskResponse>
  ): Promise<void>;
  requestVote(
    call: ServerUnaryCall<RequestVoteRequest, RequestVoteResponse>,
    callback: sendUnaryData<RequestVoteResponse>
  ): Promise<void>;
  recordLeaderHeartbeat(
    call: ServerUnaryCall<RecordLeaderHeartbeatRequest, RecordLeaderHeartbeatResponse>,
    callback: sendUnaryData<RecordLeaderHeartbeatResponse>
  ): Promise<void>;
};

/* controller */

class MasterNodeGrpcController implements MasterNodeGrpcControllerContract {
  constructor(private readonly internodeService: MasterNodeInternodeServiceContract) {}

  async fetchMasterInfo(
    call: ServerUnaryCall<FetchMasterInfoRequest, FetchMasterInfoResponse>,
    callback: sendUnaryData<FetchMasterInfoResponse>
  ): Promise<void> {
    const result = await this.internodeService.fetchMasterInfo();

    callback(null, {
      master_id: result.masterId,
      session_id: result.sessionId,
      cluster_id: result.clusterId,
      epoch: result.epoch.toString()
    });
  }

  async registerMasterNode(
    call: ServerUnaryCall<RegisterMasterNodeRequest, RegisterMasterNodeResponse>,
    callback: sendUnaryData<RegisterMasterNodeResponse>
  ): Promise<void> {
    const certificateFingerprint = getGrpcPeerCertificateFingerprint(call);

    let input;

    try {
      input = mapGrpcRegisterMasterNodeRequestToRegisterMasterNodeInternodeInput(call.request, certificateFingerprint);
    } catch (err) {
      if (err instanceof GenericMapperError) {
        throw new GenericBadRequestError('Invalid register master node request', { cause: err });
      }

      throw err;
    }

    await this.internodeService.registerMasterNode(input);

    callback(null, {});
  }

  async fetchClusterMembershipSnapshot(
    call: ServerUnaryCall<FetchClusterMembershipSnapshotRequest, FetchClusterMembershipSnapshotResponse>,
    callback: sendUnaryData<FetchClusterMembershipSnapshotResponse>
  ): Promise<void> {
    const certificateFingerprint = getGrpcPeerCertificateFingerprint(call);

    let input;

    try {
      input = mapGrpcFetchClusterMembershipSnapshotRequestToFetchClusterMembershipSnapshotInternodeInput(
        call.request,
        certificateFingerprint
      );
    } catch (err) {
      if (err instanceof GenericMapperError) {
        throw new GenericBadRequestError('Invalid fetch cluster membership snapshot request', { cause: err });
      }

      throw err;
    }

    const snapshot = await this.internodeService.fetchClusterMembershipSnapshot(input);

    callback(null, {
      snapshot: serializeClusterMembershipSnapshot(snapshot)
    });
  }

  async fetchTaskEntries(
    call: ServerUnaryCall<FetchTaskEntriesRequest, FetchTaskEntriesResponse>,
    callback: sendUnaryData<FetchTaskEntriesResponse>
  ): Promise<void> {
    const certificateFingerprint = getGrpcPeerCertificateFingerprint(call);

    let input;

    try {
      input = mapGrpcFetchTaskEntriesRequestToFetchTaskEntriesInternodeInput(call.request, certificateFingerprint);
    } catch (err) {
      if (err instanceof GenericMapperError) {
        throw new GenericBadRequestError('Invalid fetch task entries request', { cause: err });
      }

      throw err;
    }

    const result = await this.internodeService.fetchTaskEntries(input);

    callback(null, {
      epoch: result.epoch.toString(),
      last_committed_sequence: result.lastCommittedSequence.toString(),
      cluster_membership_revision: result.clusterMembershipRevision.toString(),
      entries: result.entries.map(mapInternodeTaskEntryToGrpcTaskEntry)
    });
  }

  async fetchTaskPayload(
    call: ServerUnaryCall<FetchTaskPayloadRequest, FetchTaskPayloadResponse>,
    callback: sendUnaryData<FetchTaskPayloadResponse>
  ): Promise<void> {
    const certificateFingerprint = getGrpcPeerCertificateFingerprint(call);

    let input;

    try {
      input = mapGrpcFetchTaskPayloadRequestToFetchTaskPayloadInternodeInput(call.request, certificateFingerprint);
    } catch (err) {
      if (err instanceof GenericMapperError) {
        throw new GenericBadRequestError('Invalid fetch task payload request', { cause: err });
      }

      throw err;
    }

    const payload = await this.internodeService.fetchTaskPayload(input);

    callback(null, {
      payload
    });
  }

  async forwardTask(
    call: ServerUnaryCall<ForwardTaskRequest, ForwardTaskResponse>,
    callback: sendUnaryData<ForwardTaskResponse>
  ): Promise<void> {
    const certificateFingerprint = getGrpcPeerCertificateFingerprint(call);

    let input;

    try {
      input = mapGrpcForwardTaskRequestToForwardTaskInternodeInput(call.request, certificateFingerprint);
    } catch (err) {
      if (err instanceof GenericMapperError) {
        throw new GenericBadRequestError('Invalid forward task request', { cause: err });
      }

      throw err;
    }

    const result = await this.internodeService.forwardTask(input);

    callback(null, {
      result: result === undefined ? undefined : Buffer.from(JSON.stringify(result))
    });
  }

  async requestVote(
    call: ServerUnaryCall<RequestVoteRequest, RequestVoteResponse>,
    callback: sendUnaryData<RequestVoteResponse>
  ): Promise<void> {
    const certificateFingerprint = getGrpcPeerCertificateFingerprint(call);

    let input;

    try {
      input = mapGrpcRequestVoteRequestToRequestVoteInternodeInput(call.request, certificateFingerprint);
    } catch (err) {
      if (err instanceof GenericMapperError) {
        throw new GenericBadRequestError('Invalid vote request', { cause: err });
      }

      throw err;
    }

    const result = await this.internodeService.requestVote(input);

    callback(null, {
      epoch: result.epoch.toString(),
      vote_granted: result.voteGranted
    });
  }

  async recordLeaderHeartbeat(
    call: ServerUnaryCall<RecordLeaderHeartbeatRequest, RecordLeaderHeartbeatResponse>,
    callback: sendUnaryData<RecordLeaderHeartbeatResponse>
  ): Promise<void> {
    const certificateFingerprint = getGrpcPeerCertificateFingerprint(call);

    let input;

    try {
      input = mapGrpcRecordLeaderHeartbeatRequestToRecordLeaderHeartbeatInternodeInput(
        call.request,
        certificateFingerprint
      );
    } catch (err) {
      if (err instanceof GenericMapperError) {
        throw new GenericBadRequestError('Invalid leader heartbeat request', { cause: err });
      }

      throw err;
    }

    const result = await this.internodeService.recordLeaderHeartbeat(input);

    callback(null, {
      epoch: result.epoch.toString(),
      accepted: result.accepted
    });
  }
}

/* exports */

export { MasterNodeGrpcController };
export type { MasterNodeGrpcControllerContract };
