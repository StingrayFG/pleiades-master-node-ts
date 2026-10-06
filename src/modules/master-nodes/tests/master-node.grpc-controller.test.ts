import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import type { sendUnaryData, ServerUnaryCall } from '@grpc/grpc-js';
import { describe, expect, jest, test } from '@jest/globals';

import { GenericBadRequestError } from '@/errors/application.errors';
import {
  TaskExecutionScope,
  type FetchClusterMembershipSnapshotRequest,
  type FetchClusterMembershipSnapshotResponse,
  type FetchTaskEntriesRequest,
  type FetchTaskEntriesResponse,
  type FetchTaskPayloadRequest,
  type FetchTaskPayloadResponse,
  type ForwardTaskRequest,
  type ForwardTaskResponse,
  type RecordLeaderHeartbeatRequest,
  type RecordLeaderHeartbeatResponse,
  type RegisterMasterNodeRequest,
  type RegisterMasterNodeResponse,
  type RequestVoteRequest,
  type RequestVoteResponse
} from '@/gen/proto/master/v1/master';

import type { InternodeTaskEntry } from '../master-node.application';
import type { ClusterMembershipSnapshot } from '@/modules/cluster/cluster.membership-snapshot';
import { MasterNodeGrpcController } from '../master-node.grpc-controller';
import type { MasterNodeInternodeServiceContract } from '../master-node.internode-service';

/* fixtures */

const payloadId = '00000000-0000-4000-8000-000000000003';
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const callerMasterNodeId = 'master-node-bbbbbbbbbbbb';
const callerSessionId = '00000000-0000-4000-8000-000000000004';
const peerCertificate = Buffer.from('peer certificate');
const callerCertificateFingerprint = createHash('sha256').update(peerCertificate).digest('hex');

const entry: InternodeTaskEntry = {
  id: '00000000-0000-4000-8000-000000000002',
  originMasterNodeId: 'master-node-aaaaaaaaaaaa',
  epoch: 2n,
  sequence: 4n,
  type: 'bucket.create',
  executionScope: 'cluster',
  data: { bucketName: 'test-bucket' },
  payloadId,
  createdAt
};

const clusterMembershipSnapshot: ClusterMembershipSnapshot = {
  cluster: {
    id: 'self',
    clusterId: '00000000-0000-4000-8000-000000000010',
    membershipRevision: 3n,
    createdAt,
    updatedAt: createdAt
  },
  masterNodes: [],
  dataNodes: []
};

/* helpers */

const createCall = <TRequest, TResponse>(request: TRequest): ServerUnaryCall<TRequest, TResponse> => {
  return {
    request,
    getAuthContext: () => ({ sslPeerCertificate: { raw: peerCertificate } })
  } as unknown as ServerUnaryCall<TRequest, TResponse>;
};

/* mocks */

const createInternodeServiceMock = (): jest.Mocked<MasterNodeInternodeServiceContract> => {
  const service = {
    fetchMasterInfo: jest.fn<MasterNodeInternodeServiceContract['fetchMasterInfo']>(),
    registerMasterNode: jest.fn<MasterNodeInternodeServiceContract['registerMasterNode']>(),
    fetchClusterMembershipSnapshot: jest.fn<MasterNodeInternodeServiceContract['fetchClusterMembershipSnapshot']>(),
    fetchTaskEntries: jest.fn<MasterNodeInternodeServiceContract['fetchTaskEntries']>(),
    fetchTaskPayload: jest.fn<MasterNodeInternodeServiceContract['fetchTaskPayload']>(),
    forwardTask: jest.fn<MasterNodeInternodeServiceContract['forwardTask']>(),
    requestVote: jest.fn<MasterNodeInternodeServiceContract['requestVote']>(),
    recordLeaderHeartbeat: jest.fn<MasterNodeInternodeServiceContract['recordLeaderHeartbeat']>()
  };

  service.fetchTaskEntries.mockResolvedValue({
    epoch: 2n,
    lastCommittedSequence: 4n,
    clusterMembershipRevision: 3n,
    entries: [entry]
  });
  service.fetchClusterMembershipSnapshot.mockResolvedValue(clusterMembershipSnapshot);
  service.fetchTaskPayload.mockResolvedValue(Buffer.from('task payload'));
  service.forwardTask.mockResolvedValue({ result: 'done' });
  service.requestVote.mockResolvedValue({ epoch: 2n, voteGranted: false });
  service.recordLeaderHeartbeat.mockResolvedValue({ epoch: 3n, accepted: true, lastMatchedSequence: 5n });

  return service;
};

/* tests */

describe('MasterNodeGrpcController', () => {
  test('returns an authenticated cluster membership snapshot', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<FetchClusterMembershipSnapshotResponse>>();

    await controller.fetchClusterMembershipSnapshot(
      createCall<FetchClusterMembershipSnapshotRequest, FetchClusterMembershipSnapshotResponse>({
        caller_master_id: callerMasterNodeId,
        caller_session_id: callerSessionId
      }),
      callback
    );

    expect(service.fetchClusterMembershipSnapshot).toHaveBeenCalledWith({
      callerMasterNodeId,
      callerMasterNodeSessionId: callerSessionId,
      callerCertificateFingerprint
    });
    expect(callback).toHaveBeenCalledWith(null, {
      snapshot: {
        cluster: {
          cluster_id: clusterMembershipSnapshot.cluster.clusterId,
          membership_revision: '3',
          created_at: createdAt,
          updated_at: createdAt
        },
        master_nodes: [],
        data_nodes: []
      }
    });
  });

  test('fetches task entries and maps the response to gRPC', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<FetchTaskEntriesResponse>>();

    await controller.fetchTaskEntries(
      createCall<FetchTaskEntriesRequest, FetchTaskEntriesResponse>({
        after_sequence: '-1',
        limit: 32,
        caller_master_id: callerMasterNodeId,
        caller_session_id: callerSessionId
      }),
      callback
    );

    expect(service.fetchTaskEntries).toHaveBeenCalledWith({
      callerMasterNodeId,
      callerMasterNodeSessionId: callerSessionId,
      callerCertificateFingerprint,
      afterSequence: -1n,
      limit: 32
    });
    expect(callback).toHaveBeenCalledWith(null, {
      epoch: '2',
      last_committed_sequence: '4',
      cluster_membership_revision: '3',
      entries: [
        {
          id: entry.id,
          origin_master_id: entry.originMasterNodeId,
          epoch: '2',
          sequence: '4',
          type: entry.type,
          execution_scope: TaskExecutionScope.TASK_EXECUTION_SCOPE_CLUSTER,
          data: Buffer.from(JSON.stringify(entry.data)),
          payload_id: payloadId,
          created_at: createdAt
        }
      ]
    });
  });

  test('rejects invalid task-entry requests as bad requests', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<FetchTaskEntriesResponse>>();

    await expect(
      controller.fetchTaskEntries(
        createCall<FetchTaskEntriesRequest, FetchTaskEntriesResponse>({
          after_sequence: '-2',
          limit: 0,
          caller_master_id: callerMasterNodeId,
          caller_session_id: callerSessionId
        }),
        callback
      )
    ).rejects.toBeInstanceOf(GenericBadRequestError);
    expect(service.fetchTaskEntries).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  test('fetches task payload bytes', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<FetchTaskPayloadResponse>>();

    await controller.fetchTaskPayload(
      createCall<FetchTaskPayloadRequest, FetchTaskPayloadResponse>({
        payload_id: payloadId,
        caller_master_id: callerMasterNodeId,
        caller_session_id: callerSessionId
      }),
      callback
    );

    expect(service.fetchTaskPayload).toHaveBeenCalledWith({
      callerMasterNodeId,
      callerMasterNodeSessionId: callerSessionId,
      callerCertificateFingerprint,
      payloadId
    });
    expect(callback).toHaveBeenCalledWith(null, {
      payload: Buffer.from('task payload')
    });
  });

  test('rejects invalid task payload requests as bad requests', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<FetchTaskPayloadResponse>>();

    await expect(
      controller.fetchTaskPayload(
        createCall<FetchTaskPayloadRequest, FetchTaskPayloadResponse>({
          payload_id: 'invalid',
          caller_master_id: callerMasterNodeId,
          caller_session_id: callerSessionId
        }),
        callback
      )
    ).rejects.toBeInstanceOf(GenericBadRequestError);
    expect(service.fetchTaskPayload).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });

  test('forwards authenticated task execution and encodes its result', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<ForwardTaskResponse>>();

    await controller.forwardTask(
      createCall<ForwardTaskRequest, ForwardTaskResponse>({
        type: 'test.result',
        data: Buffer.from(JSON.stringify({ value: 'input' })),
        caller_master_id: callerMasterNodeId,
        caller_session_id: callerSessionId
      }),
      callback
    );

    expect(service.forwardTask).toHaveBeenCalledWith({
      type: 'test.result',
      data: { value: 'input' },
      callerMasterNodeId,
      callerMasterNodeSessionId: callerSessionId,
      callerCertificateFingerprint
    });
    expect(callback).toHaveBeenCalledWith(null, {
      result: Buffer.from(JSON.stringify({ result: 'done' }))
    });
  });

  test('omits the forwarded result when task execution returns no result', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<ForwardTaskResponse>>();

    service.forwardTask.mockResolvedValue(undefined);

    await controller.forwardTask(
      createCall<ForwardTaskRequest, ForwardTaskResponse>({
        type: 'test.void',
        data: Buffer.from(JSON.stringify({ value: 'input' })),
        caller_master_id: callerMasterNodeId,
        caller_session_id: callerSessionId
      }),
      callback
    );

    expect(callback).toHaveBeenCalledWith(null, { result: undefined });
  });

  test('registers a master node using the presented certificate fingerprint', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<RegisterMasterNodeResponse>>();

    await controller.registerMasterNode(
      createCall<RegisterMasterNodeRequest, RegisterMasterNodeResponse>({
        master_id: callerMasterNodeId,
        session_id: callerSessionId,
        cluster_id: '00000000-0000-4000-8000-000000000010',
        hostname: 'follower.internal',
        port: 4410,
        scheme: 'grpcs'
      }),
      callback
    );

    expect(service.registerMasterNode).toHaveBeenCalledWith({
      id: callerMasterNodeId,
      certificateFingerprint: callerCertificateFingerprint,
      sessionId: callerSessionId,
      clusterId: '00000000-0000-4000-8000-000000000010',
      endpoint: {
        hostname: 'follower.internal',
        port: 4410,
        scheme: 'grpcs'
      }
    });
    expect(callback).toHaveBeenCalledWith(null, {});
  });

  test('maps authenticated vote requests and responses', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<RequestVoteResponse>>();

    await controller.requestVote(
      createCall<RequestVoteRequest, RequestVoteResponse>({
        epoch: '3',
        last_log_sequence: '4',
        caller_master_id: callerMasterNodeId,
        caller_session_id: callerSessionId,
        last_log_epoch: '2'
      }),
      callback
    );

    expect(service.requestVote).toHaveBeenCalledWith({
      callerMasterNodeId,
      callerMasterNodeSessionId: callerSessionId,
      callerCertificateFingerprint,
      epoch: 3n,
      lastLogEpoch: 2n,
      lastLogSequence: 4n
    });
    expect(callback).toHaveBeenCalledWith(null, {
      epoch: '2',
      vote_granted: false
    });
  });

  test('maps authenticated leader heartbeats and responses', async () => {
    const service = createInternodeServiceMock();
    const controller = new MasterNodeGrpcController(service);
    const callback = jest.fn<sendUnaryData<RecordLeaderHeartbeatResponse>>();

    await controller.recordLeaderHeartbeat(
      createCall<RecordLeaderHeartbeatRequest, RecordLeaderHeartbeatResponse>({
        epoch: '3',
        last_committed_sequence: '4',
        caller_master_id: callerMasterNodeId,
        caller_session_id: callerSessionId
      }),
      callback
    );

    expect(service.recordLeaderHeartbeat).toHaveBeenCalledWith({
      callerMasterNodeId,
      callerMasterNodeSessionId: callerSessionId,
      callerCertificateFingerprint,
      epoch: 3n,
      lastCommittedSequence: 4n
    });
    expect(callback).toHaveBeenCalledWith(null, {
      epoch: '3',
      accepted: true,
      last_matched_sequence: '5'
    });
  });
});
