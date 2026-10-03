import type { Buffer } from 'node:buffer';

import { Metadata } from '@grpc/grpc-js';

import {
  MasterClient as GrpcMasterClient,
  type FetchMasterInfoResponse,
  type RegisterMasterNodeResponse,
  type FetchClusterMembershipSnapshotResponse,
  type FetchTaskEntriesResponse,
  type FetchTaskPayloadResponse,
  type ForwardTaskResponse,
  type RequestVoteResponse,
  type RecordLeaderHeartbeatResponse
} from '@/gen/proto/master/v1/master';
import type { ClusterMembershipSnapshot } from '@/modules/cluster/cluster.membership-snapshot';
import type { RequestVoteResult } from '@/modules/election/election.application';
import type { RecordLeaderHeartbeatResult } from '@/modules/leadership/leadership.application';
import type { GrpcClientCredentialsContract } from '@/transports/grpc/client/credentials/grpc-client-credentials.contract';
import type { GrpcClientConfig } from '@/transports/grpc/client/grpc-client.config';
import { createDefaultGrpcCallOptions } from '@/transports/grpc/client/grpc-client.options';
import { mapGrpcErrorToInternodeApplicationError } from '@/transports/grpc/mappers/error.mappers';

import type {
  FetchMasterInfoClientInput,
  FetchMasterInfoInternodeResult,
  RegisterMasterNodeClientInput,
  FetchClusterMembershipSnapshotClientInput,
  FetchTaskEntriesClientInput,
  FetchTaskEntriesInternodeResult,
  FetchTaskPayloadClientInput,
  ForwardTaskClientInput,
  RequestVoteClientInput,
  RecordLeaderHeartbeatClientInput
} from './master-node.application';
import type { MasterNodeEndpoint, MasterNodeId, MasterNodeSessionId } from './master-node.domain';
import {
  mapGrpcFetchMasterInfoResponseToFetchMasterInfoInternodeResult,
  mapGrpcClusterMembershipSnapshotToClusterMembershipSnapshot,
  mapGrpcTaskEntryToInternodeTaskEntry,
  mapGrpcRequestVoteResponseToRequestVoteResult,
  mapGrpcRecordLeaderHeartbeatResponseToRecordLeaderHeartbeatResult
} from './master-node.mappers';

/* contract */

type MasterNodeGrpcClientContract = {
  fetchMasterInfo(input: FetchMasterInfoClientInput): Promise<FetchMasterInfoInternodeResult>;
  registerMasterNode(input: RegisterMasterNodeClientInput): Promise<void>;
  fetchClusterMembershipSnapshot(input: FetchClusterMembershipSnapshotClientInput): Promise<ClusterMembershipSnapshot>;
  fetchTaskEntries(input: FetchTaskEntriesClientInput): Promise<FetchTaskEntriesInternodeResult>;
  fetchTaskPayload(input: FetchTaskPayloadClientInput): Promise<Buffer>;
  forwardTask(input: ForwardTaskClientInput): Promise<Buffer | undefined>;
  requestVote(input: RequestVoteClientInput): Promise<RequestVoteResult>;
  recordLeaderHeartbeat(input: RecordLeaderHeartbeatClientInput): Promise<RecordLeaderHeartbeatResult>;
  close(): void;
};

/* client */

class MasterNodeGrpcClient implements MasterNodeGrpcClientContract {
  private readonly clientsByEndpoint = new Map<string, GrpcMasterClient>();

  constructor(
    private readonly grpcConfig: GrpcClientConfig,
    private readonly grpcClientCredentials: GrpcClientCredentialsContract,
    private readonly selfMasterNodeId: MasterNodeId,
    private readonly selfMasterNodeSessionId: MasterNodeSessionId
  ) {}

  close(): void {
    for (const client of this.clientsByEndpoint.values()) {
      client.close();
    }

    this.clientsByEndpoint.clear();
  }

  async fetchMasterInfo(input: FetchMasterInfoClientInput): Promise<FetchMasterInfoInternodeResult> {
    const client = this.getClient(input.masterNodeEndpoint, input.expectedCertificateFingerprint);

    const response = await new Promise<FetchMasterInfoResponse>((resolve, reject) => {
      client.fetchMasterInfo({}, new Metadata(), createDefaultGrpcCallOptions(), (err, response) => {
        if (err) {
          reject(mapGrpcErrorToInternodeApplicationError(err));
          return;
        }

        resolve(response);
      });
    });

    return mapGrpcFetchMasterInfoResponseToFetchMasterInfoInternodeResult(response);
  }

  async registerMasterNode(input: RegisterMasterNodeClientInput): Promise<void> {
    const client = this.getClient(input.masterNodeEndpoint, input.expectedCertificateFingerprint);

    await new Promise<RegisterMasterNodeResponse>((resolve, reject) => {
      client.registerMasterNode(
        {
          master_id: input.id,
          session_id: input.sessionId,
          cluster_id: input.clusterId,
          hostname: input.endpoint.hostname,
          port: input.endpoint.port,
          scheme: input.endpoint.scheme
        },
        new Metadata(),
        createDefaultGrpcCallOptions(),
        (err, response) => {
          if (err) {
            reject(mapGrpcErrorToInternodeApplicationError(err));
            return;
          }

          resolve(response);
        }
      );
    });
  }

  async fetchClusterMembershipSnapshot(
    input: FetchClusterMembershipSnapshotClientInput
  ): Promise<ClusterMembershipSnapshot> {
    const client = this.getClient(input.masterNodeEndpoint, input.expectedCertificateFingerprint);

    const response = await new Promise<FetchClusterMembershipSnapshotResponse>((resolve, reject) => {
      client.fetchClusterMembershipSnapshot(
        {
          caller_master_id: this.selfMasterNodeId,
          caller_session_id: this.selfMasterNodeSessionId
        },
        new Metadata(),
        createDefaultGrpcCallOptions(),
        (err, response) => {
          if (err) {
            reject(mapGrpcErrorToInternodeApplicationError(err));
            return;
          }

          resolve(response);
        }
      );
    });

    return mapGrpcClusterMembershipSnapshotToClusterMembershipSnapshot(response.snapshot);
  }

  async fetchTaskEntries(input: FetchTaskEntriesClientInput): Promise<FetchTaskEntriesInternodeResult> {
    const client = this.getClient(input.masterNodeEndpoint, input.expectedCertificateFingerprint);

    const response = await new Promise<FetchTaskEntriesResponse>((resolve, reject) => {
      client.fetchTaskEntries(
        {
          after_sequence: input.afterSequence.toString(),
          limit: input.limit,
          caller_master_id: this.selfMasterNodeId,
          caller_session_id: this.selfMasterNodeSessionId
        },
        new Metadata(),
        createDefaultGrpcCallOptions(),
        (err, response) => {
          if (err) {
            reject(mapGrpcErrorToInternodeApplicationError(err));
            return;
          }

          resolve(response);
        }
      );
    });

    return {
      epoch: BigInt(response.epoch),
      lastCommittedSequence: BigInt(response.last_committed_sequence),
      clusterMembershipRevision: BigInt(response.cluster_membership_revision),
      entries: response.entries.map(mapGrpcTaskEntryToInternodeTaskEntry)
    };
  }

  async fetchTaskPayload(input: FetchTaskPayloadClientInput): Promise<Buffer> {
    const client = this.getClient(input.masterNodeEndpoint, input.expectedCertificateFingerprint);

    const response = await new Promise<FetchTaskPayloadResponse>((resolve, reject) => {
      client.fetchTaskPayload(
        {
          payload_id: input.payloadId,
          caller_master_id: this.selfMasterNodeId,
          caller_session_id: this.selfMasterNodeSessionId
        },
        new Metadata(),
        createDefaultGrpcCallOptions(),
        (err, response) => {
          if (err) {
            reject(mapGrpcErrorToInternodeApplicationError(err));
            return;
          }

          resolve(response);
        }
      );
    });

    return response.payload;
  }

  async forwardTask(input: ForwardTaskClientInput): Promise<Buffer | undefined> {
    const client = this.getClient(input.masterNodeEndpoint, input.expectedCertificateFingerprint);

    const response = await new Promise<ForwardTaskResponse>((resolve, reject) => {
      client.forwardTask(
        {
          type: input.type,
          data: input.data,
          caller_master_id: this.selfMasterNodeId,
          caller_session_id: this.selfMasterNodeSessionId
        },
        new Metadata(),
        createDefaultGrpcCallOptions(),
        (err, response) => {
          if (err) {
            reject(mapGrpcErrorToInternodeApplicationError(err));
            return;
          }

          resolve(response);
        }
      );
    });

    return response.result;
  }

  async requestVote(input: RequestVoteClientInput): Promise<RequestVoteResult> {
    const client = this.getClient(input.masterNodeEndpoint, input.expectedCertificateFingerprint);

    const response = await new Promise<RequestVoteResponse>((resolve, reject) => {
      client.requestVote(
        {
          epoch: input.epoch.toString(),
          last_log_sequence: input.lastLogSequence.toString(),
          caller_master_id: this.selfMasterNodeId,
          caller_session_id: this.selfMasterNodeSessionId,
          last_log_epoch: input.lastLogEpoch.toString()
        },
        new Metadata(),
        createDefaultGrpcCallOptions(),
        (err, response) => {
          if (err) {
            reject(mapGrpcErrorToInternodeApplicationError(err));
            return;
          }

          resolve(response);
        }
      );
    });

    return mapGrpcRequestVoteResponseToRequestVoteResult(response);
  }

  async recordLeaderHeartbeat(input: RecordLeaderHeartbeatClientInput): Promise<RecordLeaderHeartbeatResult> {
    const client = this.getClient(input.masterNodeEndpoint, input.expectedCertificateFingerprint);

    const response = await new Promise<RecordLeaderHeartbeatResponse>((resolve, reject) => {
      client.recordLeaderHeartbeat(
        {
          epoch: input.epoch.toString(),
          last_committed_sequence: input.lastCommittedSequence.toString(),
          caller_master_id: this.selfMasterNodeId,
          caller_session_id: this.selfMasterNodeSessionId
        },
        new Metadata(),
        createDefaultGrpcCallOptions(),
        (err, response) => {
          if (err) {
            reject(mapGrpcErrorToInternodeApplicationError(err));
            return;
          }

          resolve(response);
        }
      );
    });

    return mapGrpcRecordLeaderHeartbeatResponseToRecordLeaderHeartbeatResult(response);
  }

  /* private */

  private getClient(endpoint: MasterNodeEndpoint, expectedCertificateFingerprint: string): GrpcMasterClient {
    const endpointKey = `${endpoint.scheme}://${endpoint.hostname}:${endpoint.port}/${expectedCertificateFingerprint}`;

    const existingClient = this.clientsByEndpoint.get(endpointKey);

    if (existingClient) {
      return existingClient;
    }

    const credentials = this.grpcClientCredentials.get({
      expectedServerCertificateFingerprint: expectedCertificateFingerprint
    });
    const maxMessageSizeBytes = this.grpcConfig.maxMessageSizeBytes;

    const client = new GrpcMasterClient(`${endpoint.hostname}:${endpoint.port}`, credentials, {
      'grpc.max_receive_message_length': maxMessageSizeBytes,
      'grpc.max_send_message_length': maxMessageSizeBytes
    });

    this.clientsByEndpoint.set(endpointKey, client);

    return client;
  }
}

/* exports */

export { MasterNodeGrpcClient };
export type {
  FetchClusterMembershipSnapshotClientInput,
  FetchTaskEntriesClientInput,
  FetchTaskPayloadClientInput,
  ForwardTaskClientInput,
  MasterNodeGrpcClientContract,
  RegisterMasterNodeClientInput,
  RequestVoteClientInput,
  RecordLeaderHeartbeatClientInput
};
