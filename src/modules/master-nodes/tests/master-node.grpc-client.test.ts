import { Buffer } from 'node:buffer';

import type { ChannelCredentials, ServiceError } from '@grpc/grpc-js';
import { Metadata, status } from '@grpc/grpc-js';
import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';
import { InternodeUnavailableError } from '@/errors/internode.errors';
import type {
  FetchMasterInfoResponse,
  FetchClusterMembershipSnapshotResponse,
  FetchTaskEntriesResponse,
  FetchTaskPayloadResponse,
  MasterClient as GrpcMasterClient,
  RecordLeaderHeartbeatResponse,
  RegisterMasterNodeResponse,
  RequestVoteResponse,
  TaskExecutionScope
} from '@/gen/proto/master/v1/master';
import type { GrpcClientCredentialsContract } from '@/transports/grpc/client/credentials/grpc-client-credentials.contract';
import type { GrpcClientConfig } from '@/transports/grpc/client/grpc-client.config';

import type { MasterNodeEndpoint } from '../master-node.domain';

/* fixtures */

const endpoint: MasterNodeEndpoint = {
  hostname: 'master-node.internal',
  port: 50051,
  scheme: 'grpcs'
};

const grpcConfig: GrpcClientConfig = {
  maxMessageSizeBytes: 4 * 1024 * 1024
};

const payloadId = '00000000-0000-4000-8000-000000000003';
const certificateFingerprint = 'ab'.repeat(32);
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const selfMasterNodeId = 'master-node-follower';
const selfMasterNodeSessionId = '00000000-0000-4000-8000-000000000004';

const masterInfoResponse: FetchMasterInfoResponse = {
  master_id: 'master-node-a',
  session_id: '00000000-0000-4000-8000-000000000001',
  cluster_id: '00000000-0000-4000-8000-000000000002',
  epoch: '2'
};

const entriesResponse: FetchTaskEntriesResponse = {
  epoch: '2',
  last_committed_sequence: '4',
  cluster_membership_revision: '3',
  entries: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      origin_master_id: 'master-node-a',
      epoch: '2',
      sequence: '4',
      type: 'bucket.create',
      execution_scope: 2 as TaskExecutionScope,
      data: Buffer.from(JSON.stringify({ bucketName: 'test-bucket' })),
      payload_id: payloadId,
      created_at: createdAt
    }
  ]
};

const payloadResponse: FetchTaskPayloadResponse = {
  payload: Buffer.from('task payload')
};

const voteResponse: RequestVoteResponse = {
  epoch: '2',
  vote_granted: false
};

const heartbeatResponse: RecordLeaderHeartbeatResponse = {
  epoch: '3',
  accepted: true,
  last_matched_sequence: '5'
};

const clusterMembershipSnapshotResponse: FetchClusterMembershipSnapshotResponse = {
  snapshot: Buffer.from(
    JSON.stringify({
      cluster: {
        id: 'self',
        clusterId: masterInfoResponse.cluster_id,
        membershipRevision: '3',
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString()
      },
      masterNodes: [],
      dataNodes: []
    })
  )
};

/* mocks */

type EntriesCallback = (error: ServiceError | null, response: FetchTaskEntriesResponse) => void;
type MasterInfoCallback = (error: ServiceError | null, response: FetchMasterInfoResponse) => void;
type ClusterMembershipSnapshotCallback = (
  error: ServiceError | null,
  response: FetchClusterMembershipSnapshotResponse
) => void;
type PayloadCallback = (error: ServiceError | null, response: FetchTaskPayloadResponse) => void;
type RegistrationCallback = (error: ServiceError | null, response: RegisterMasterNodeResponse) => void;
type VoteCallback = (error: ServiceError | null, response: RequestVoteResponse) => void;
type HeartbeatCallback = (error: ServiceError | null, response: RecordLeaderHeartbeatResponse) => void;

type GrpcMasterClientMock = {
  fetchMasterInfo: jest.Mock<
    (_request: unknown, _metadata: unknown, _options: unknown, callback: MasterInfoCallback) => void
  >;
  registerMasterNode: jest.Mock<
    (_request: unknown, _metadata: unknown, _options: unknown, callback: RegistrationCallback) => void
  >;
  fetchClusterMembershipSnapshot: jest.Mock<
    (_request: unknown, _metadata: unknown, _options: unknown, callback: ClusterMembershipSnapshotCallback) => void
  >;
  fetchTaskEntries: jest.Mock<
    (_request: unknown, _metadata: unknown, _options: unknown, callback: EntriesCallback) => void
  >;
  fetchTaskPayload: jest.Mock<
    (_request: unknown, _metadata: unknown, _options: unknown, callback: PayloadCallback) => void
  >;
  requestVote: jest.Mock<(_request: unknown, _metadata: unknown, _options: unknown, callback: VoteCallback) => void>;
  recordLeaderHeartbeat: jest.Mock<
    (_request: unknown, _metadata: unknown, _options: unknown, callback: HeartbeatCallback) => void
  >;
  close: jest.Mock<() => void>;
};

const grpcMasterClientConstructorMock = jest.fn();

let MasterNodeGrpcClient: typeof import('../master-node.grpc-client').MasterNodeGrpcClient;

const createCredentialsMock = () => {
  const credentials = {} as ChannelCredentials;
  const provider: jest.Mocked<GrpcClientCredentialsContract> = {
    get: jest.fn<GrpcClientCredentialsContract['get']>().mockReturnValue(credentials)
  };

  return {
    credentials,
    provider
  };
};

const createClient = (provider: GrpcClientCredentialsContract): InstanceType<typeof MasterNodeGrpcClient> => {
  return new MasterNodeGrpcClient(grpcConfig, provider, selfMasterNodeId, selfMasterNodeSessionId);
};

/* tests */

describe('MasterNodeGrpcClient', () => {
  let createdClients: GrpcMasterClientMock[];

  beforeAll(async () => {
    jest.doMock('@/gen/proto/master/v1/master', () => {
      const actual = jest.requireActual<typeof import('@/gen/proto/master/v1/master')>('@/gen/proto/master/v1/master');

      return {
        ...actual,
        MasterClient: grpcMasterClientConstructorMock
      };
    });

    ({ MasterNodeGrpcClient } = await import('../master-node.grpc-client'));
  });

  afterAll(() => {
    jest.dontMock('@/gen/proto/master/v1/master');
  });

  beforeEach(() => {
    createdClients = [];
    grpcMasterClientConstructorMock.mockReset();

    grpcMasterClientConstructorMock.mockImplementation(() => {
      const client: GrpcMasterClientMock = {
        fetchMasterInfo: jest.fn((_request, _metadata, _options, callback: MasterInfoCallback) => {
          callback(null, masterInfoResponse);
        }),
        registerMasterNode: jest.fn((_request, _metadata, _options, callback: RegistrationCallback) => {
          callback(null, {});
        }),
        fetchClusterMembershipSnapshot: jest.fn(
          (_request, _metadata, _options, callback: ClusterMembershipSnapshotCallback) => {
            callback(null, clusterMembershipSnapshotResponse);
          }
        ),
        fetchTaskEntries: jest.fn((_request, _metadata, _options, callback: EntriesCallback) => {
          callback(null, entriesResponse);
        }),
        fetchTaskPayload: jest.fn((_request, _metadata, _options, callback: PayloadCallback) => {
          callback(null, payloadResponse);
        }),
        requestVote: jest.fn((_request, _metadata, _options, callback: VoteCallback) => {
          callback(null, voteResponse);
        }),
        recordLeaderHeartbeat: jest.fn((_request, _metadata, _options, callback: HeartbeatCallback) => {
          callback(null, heartbeatResponse);
        }),
        close: jest.fn()
      };

      createdClients.push(client);

      return client as unknown as InstanceType<typeof GrpcMasterClient>;
    });
  });

  test('fetches the leader identity, cluster, and consensus epoch', async () => {
    const { provider } = createCredentialsMock();
    const client = createClient(provider);

    await expect(
      client.fetchMasterInfo({
        masterNodeEndpoint: endpoint,
        expectedCertificateFingerprint: certificateFingerprint
      })
    ).resolves.toEqual({
      masterId: masterInfoResponse.master_id,
      sessionId: masterInfoResponse.session_id,
      clusterId: masterInfoResponse.cluster_id,
      epoch: 2n
    });
    expect(createdClients[0].fetchMasterInfo).toHaveBeenCalledWith(
      {},
      expect.any(Metadata),
      expect.objectContaining({ deadline: expect.any(Date) }),
      expect.any(Function)
    );
    expect(provider.get).toHaveBeenCalledWith({
      expectedServerCertificateFingerprint: certificateFingerprint
    });
  });

  test('rejects malformed leader information returned by a peer', async () => {
    const { provider } = createCredentialsMock();
    const client = createClient(provider);

    grpcMasterClientConstructorMock.mockImplementationOnce(() => {
      const grpcClient: GrpcMasterClientMock = {
        fetchMasterInfo: jest.fn((_request, _metadata, _options, callback: MasterInfoCallback) => {
          callback(null, {
            ...masterInfoResponse,
            cluster_id: 'invalid-cluster-id'
          });
        }),
        registerMasterNode: jest.fn(),
        fetchClusterMembershipSnapshot: jest.fn(),
        fetchTaskEntries: jest.fn(),
        fetchTaskPayload: jest.fn(),
        requestVote: jest.fn(),
        recordLeaderHeartbeat: jest.fn(),
        close: jest.fn()
      };

      createdClients.push(grpcClient);

      return grpcClient as unknown as InstanceType<typeof GrpcMasterClient>;
    });

    await expect(
      client.fetchMasterInfo({
        masterNodeEndpoint: endpoint,
        expectedCertificateFingerprint: certificateFingerprint
      })
    ).rejects.toBeInstanceOf(GenericMapperError);
  });

  test('registers the local master node with the pinned leader', async () => {
    const { provider } = createCredentialsMock();
    const client = createClient(provider);

    await expect(
      client.registerMasterNode({
        masterNodeEndpoint: endpoint,
        expectedCertificateFingerprint: certificateFingerprint,
        id: selfMasterNodeId,
        sessionId: selfMasterNodeSessionId,
        clusterId: masterInfoResponse.cluster_id,
        endpoint: {
          hostname: 'follower.internal',
          port: 4410,
          scheme: 'grpcs'
        }
      })
    ).resolves.toBeUndefined();

    expect(createdClients[0].registerMasterNode).toHaveBeenCalledWith(
      {
        master_id: selfMasterNodeId,
        session_id: selfMasterNodeSessionId,
        cluster_id: masterInfoResponse.cluster_id,
        hostname: 'follower.internal',
        port: 4410,
        scheme: 'grpcs'
      },
      expect.any(Metadata),
      expect.objectContaining({ deadline: expect.any(Date) }),
      expect.any(Function)
    );
  });

  test('fetches and validates the authenticated cluster membership snapshot', async () => {
    const { provider } = createCredentialsMock();
    const client = createClient(provider);

    await expect(
      client.fetchClusterMembershipSnapshot({
        masterNodeEndpoint: endpoint,
        expectedCertificateFingerprint: certificateFingerprint
      })
    ).resolves.toEqual({
      cluster: {
        id: 'self',
        clusterId: masterInfoResponse.cluster_id,
        membershipRevision: 3n,
        createdAt,
        updatedAt: createdAt
      },
      masterNodes: [],
      dataNodes: []
    });

    expect(createdClients[0].fetchClusterMembershipSnapshot).toHaveBeenCalledWith(
      {
        caller_master_id: selfMasterNodeId,
        caller_session_id: selfMasterNodeSessionId
      },
      expect.any(Metadata),
      expect.objectContaining({ deadline: expect.any(Date) }),
      expect.any(Function)
    );
  });

  test('requests a vote from an authenticated master node', async () => {
    const { provider } = createCredentialsMock();
    const client = createClient(provider);

    await expect(
      client.requestVote({
        masterNodeEndpoint: endpoint,
        expectedCertificateFingerprint: certificateFingerprint,
        epoch: 3n,
        lastLogEpoch: 2n,
        lastLogSequence: 4n
      })
    ).resolves.toEqual({
      epoch: 2n,
      voteGranted: false
    });

    expect(createdClients[0].requestVote).toHaveBeenCalledWith(
      {
        epoch: '3',
        last_log_sequence: '4',
        caller_master_id: selfMasterNodeId,
        caller_session_id: selfMasterNodeSessionId,
        last_log_epoch: '2'
      },
      expect.any(Metadata),
      expect.objectContaining({ deadline: expect.any(Date) }),
      expect.any(Function)
    );
  });

  test('records a leader heartbeat with an authenticated master node', async () => {
    const { provider } = createCredentialsMock();
    const client = createClient(provider);

    await expect(
      client.recordLeaderHeartbeat({
        masterNodeEndpoint: endpoint,
        expectedCertificateFingerprint: certificateFingerprint,
        epoch: 3n,
        lastCommittedSequence: 4n
      })
    ).resolves.toEqual({
      epoch: 3n,
      accepted: true,
      lastMatchedSequence: 5n
    });

    expect(createdClients[0].recordLeaderHeartbeat).toHaveBeenCalledWith(
      {
        epoch: '3',
        last_committed_sequence: '4',
        caller_master_id: selfMasterNodeId,
        caller_session_id: selfMasterNodeSessionId
      },
      expect.any(Metadata),
      expect.objectContaining({ deadline: expect.any(Date) }),
      expect.any(Function)
    );
  });

  test('fetches and maps task entries', async () => {
    const { credentials, provider } = createCredentialsMock();
    const client = createClient(provider);

    await expect(
      client.fetchTaskEntries({
        masterNodeEndpoint: endpoint,
        expectedCertificateFingerprint: certificateFingerprint,
        afterSequence: -1n,
        limit: 32
      })
    ).resolves.toEqual({
      epoch: 2n,
      lastCommittedSequence: 4n,
      clusterMembershipRevision: 3n,
      entries: [
        {
          id: entriesResponse.entries[0].id,
          originMasterNodeId: entriesResponse.entries[0].origin_master_id,
          epoch: 2n,
          sequence: 4n,
          type: entriesResponse.entries[0].type,
          executionScope: 'cluster',
          data: { bucketName: 'test-bucket' },
          payloadId,
          createdAt
        }
      ]
    });
    expect(grpcMasterClientConstructorMock).toHaveBeenCalledWith('master-node.internal:50051', credentials, {
      'grpc.max_receive_message_length': grpcConfig.maxMessageSizeBytes,
      'grpc.max_send_message_length': grpcConfig.maxMessageSizeBytes
    });
    expect(createdClients[0].fetchTaskEntries).toHaveBeenCalledWith(
      {
        after_sequence: '-1',
        limit: 32,
        caller_master_id: selfMasterNodeId,
        caller_session_id: selfMasterNodeSessionId
      },
      expect.any(Metadata),
      expect.objectContaining({ deadline: expect.any(Date) }),
      expect.any(Function)
    );
  });

  test('fetches task payload bytes', async () => {
    const { provider } = createCredentialsMock();
    const client = createClient(provider);

    await expect(
      client.fetchTaskPayload({
        masterNodeEndpoint: endpoint,
        expectedCertificateFingerprint: certificateFingerprint,
        payloadId
      })
    ).resolves.toEqual(payloadResponse.payload);
    expect(createdClients[0].fetchTaskPayload).toHaveBeenCalledWith(
      {
        payload_id: payloadId,
        caller_master_id: selfMasterNodeId,
        caller_session_id: selfMasterNodeSessionId
      },
      expect.any(Metadata),
      expect.objectContaining({ deadline: expect.any(Date) }),
      expect.any(Function)
    );
  });

  test('reuses a client for task entries and payloads from the same endpoint', async () => {
    const { provider } = createCredentialsMock();
    const client = createClient(provider);

    await client.fetchTaskEntries({
      masterNodeEndpoint: endpoint,
      expectedCertificateFingerprint: certificateFingerprint,
      afterSequence: -1n,
      limit: 32
    });
    await client.fetchTaskPayload({
      masterNodeEndpoint: endpoint,
      expectedCertificateFingerprint: certificateFingerprint,
      payloadId
    });

    expect(grpcMasterClientConstructorMock).toHaveBeenCalledTimes(1);
    expect(provider.get).toHaveBeenCalledTimes(1);
  });

  test('does not reuse a channel pinned to a different certificate', async () => {
    const { provider } = createCredentialsMock();
    const client = createClient(provider);

    await client.fetchTaskEntries({
      masterNodeEndpoint: endpoint,
      expectedCertificateFingerprint: certificateFingerprint,
      afterSequence: -1n,
      limit: 32
    });
    await client.fetchTaskPayload({
      masterNodeEndpoint: endpoint,
      expectedCertificateFingerprint: 'cd'.repeat(32),
      payloadId
    });

    expect(grpcMasterClientConstructorMock).toHaveBeenCalledTimes(2);
    expect(provider.get).toHaveBeenNthCalledWith(1, {
      expectedServerCertificateFingerprint: certificateFingerprint
    });
    expect(provider.get).toHaveBeenNthCalledWith(2, {
      expectedServerCertificateFingerprint: 'cd'.repeat(32)
    });
  });

  test('maps gRPC failures to internode application errors', async () => {
    const { provider } = createCredentialsMock();
    const client = createClient(provider);
    const grpcError = {
      name: 'Error',
      message: '14 UNAVAILABLE: master node unavailable',
      code: status.UNAVAILABLE,
      details: 'master node unavailable',
      metadata: new Metadata()
    } as ServiceError;

    grpcMasterClientConstructorMock.mockImplementationOnce(() => {
      const grpcClient: GrpcMasterClientMock = {
        fetchMasterInfo: jest.fn(),
        registerMasterNode: jest.fn(),
        fetchClusterMembershipSnapshot: jest.fn(),
        fetchTaskEntries: jest.fn((_request, _metadata, _options, callback: EntriesCallback) => {
          callback(grpcError, entriesResponse);
        }),
        fetchTaskPayload: jest.fn(),
        requestVote: jest.fn(),
        recordLeaderHeartbeat: jest.fn(),
        close: jest.fn()
      };

      createdClients.push(grpcClient);

      return grpcClient as unknown as InstanceType<typeof GrpcMasterClient>;
    });

    await expect(
      client.fetchTaskEntries({
        masterNodeEndpoint: endpoint,
        expectedCertificateFingerprint: certificateFingerprint,
        afterSequence: -1n,
        limit: 32
      })
    ).rejects.toBeInstanceOf(InternodeUnavailableError);
  });

  test('rejects malformed task entries returned by a peer', async () => {
    const { provider } = createCredentialsMock();
    const client = createClient(provider);

    grpcMasterClientConstructorMock.mockImplementationOnce(() => {
      const grpcClient: GrpcMasterClientMock = {
        fetchMasterInfo: jest.fn(),
        registerMasterNode: jest.fn(),
        fetchClusterMembershipSnapshot: jest.fn(),
        fetchTaskEntries: jest.fn((_request, _metadata, _options, callback: EntriesCallback) => {
          callback(null, {
            ...entriesResponse,
            entries: [
              {
                ...entriesResponse.entries[0],
                data: Buffer.from('invalid json')
              }
            ]
          });
        }),
        fetchTaskPayload: jest.fn(),
        requestVote: jest.fn(),
        recordLeaderHeartbeat: jest.fn(),
        close: jest.fn()
      };

      createdClients.push(grpcClient);

      return grpcClient as unknown as InstanceType<typeof GrpcMasterClient>;
    });

    await expect(
      client.fetchTaskEntries({
        masterNodeEndpoint: endpoint,
        expectedCertificateFingerprint: certificateFingerprint,
        afterSequence: -1n,
        limit: 32
      })
    ).rejects.toBeInstanceOf(GenericMapperError);
  });

  test('closes cached clients and creates a new one for later requests', async () => {
    const { provider } = createCredentialsMock();
    const client = createClient(provider);

    await client.fetchTaskEntries({
      masterNodeEndpoint: endpoint,
      expectedCertificateFingerprint: certificateFingerprint,
      afterSequence: -1n,
      limit: 32
    });
    client.close();

    expect(createdClients[0].close).toHaveBeenCalledTimes(1);

    await client.fetchTaskEntries({
      masterNodeEndpoint: endpoint,
      expectedCertificateFingerprint: certificateFingerprint,
      afterSequence: -1n,
      limit: 32
    });

    expect(grpcMasterClientConstructorMock).toHaveBeenCalledTimes(2);
  });
});
