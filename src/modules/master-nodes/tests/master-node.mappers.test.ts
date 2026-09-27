import { Buffer } from 'node:buffer';

import type { MasterNode as PrismaMasterNode } from '@prisma/client';
import { describe, expect, test } from '@jest/globals';

import { GenericMapperError } from '@/errors/application.errors';
import { TaskExecutionScope } from '@/gen/proto/master/v1/master';

import type { InternodeTaskEntry } from '../master-node.application';
import type { MasterNode } from '../master-node.domain';
import {
  mapGrpcFetchTaskEntriesRequestToFetchTaskEntriesInternodeInput,
  mapGrpcFetchTaskPayloadRequestToFetchTaskPayloadInternodeInput,
  mapGrpcRecordLeaderHeartbeatRequestToRecordLeaderHeartbeatInternodeInput,
  mapGrpcRecordLeaderHeartbeatResponseToRecordLeaderHeartbeatResult,
  mapGrpcRegisterMasterNodeRequestToRegisterMasterNodeInternodeInput,
  mapGrpcRequestVoteRequestToRequestVoteInternodeInput,
  mapGrpcRequestVoteResponseToRequestVoteResult,
  mapGrpcTaskEntryToInternodeTaskEntry,
  mapGrpcTaskExecutionScopeToTaskExecutionScope,
  mapInternodeTaskEntryToGrpcTaskEntry,
  mapPrismaMasterNodeToDomainMasterNode,
  mapTaskExecutionScopeToGrpcTaskExecutionScope
} from '../master-node.mappers';

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

const taskEntry: InternodeTaskEntry = {
  id: '00000000-0000-4000-8000-000000000002',
  originMasterNodeId: domainMasterNode.id,
  epoch: 2n,
  sequence: 4n,
  type: 'bucket.create',
  executionScope: 'cluster',
  data: { bucketName: 'test-bucket' },
  payloadId: '00000000-0000-4000-8000-000000000003',
  createdAt: new Date('2026-01-03T00:00:00.000Z')
};

const callerCertificateFingerprint = domainMasterNode.certificateFingerprint;

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

  test('maps task-entry and payload gRPC requests to internode inputs', () => {
    expect(
      mapGrpcFetchTaskEntriesRequestToFetchTaskEntriesInternodeInput(
        {
          after_sequence: '-1',
          limit: 32,
          caller_master_id: domainMasterNode.id,
          caller_session_id: domainMasterNode.sessionId
        },
        callerCertificateFingerprint
      )
    ).toEqual({
      callerMasterNodeId: domainMasterNode.id,
      callerMasterNodeSessionId: domainMasterNode.sessionId,
      callerCertificateFingerprint,
      afterSequence: -1n,
      limit: 32
    });
    expect(
      mapGrpcFetchTaskPayloadRequestToFetchTaskPayloadInternodeInput(
        {
          payload_id: taskEntry.payloadId!,
          caller_master_id: domainMasterNode.id,
          caller_session_id: domainMasterNode.sessionId
        },
        callerCertificateFingerprint
      )
    ).toEqual({
      callerMasterNodeId: domainMasterNode.id,
      callerMasterNodeSessionId: domainMasterNode.sessionId,
      callerCertificateFingerprint,
      payloadId: taskEntry.payloadId
    });
  });

  test('maps a master registration request with the presented certificate fingerprint', () => {
    expect(
      mapGrpcRegisterMasterNodeRequestToRegisterMasterNodeInternodeInput(
        {
          master_id: domainMasterNode.id,
          session_id: domainMasterNode.sessionId,
          cluster_id: '00000000-0000-4000-8000-000000000010',
          hostname: domainMasterNode.hostname,
          port: domainMasterNode.port,
          scheme: domainMasterNode.scheme
        },
        callerCertificateFingerprint
      )
    ).toEqual({
      id: domainMasterNode.id,
      certificateFingerprint: callerCertificateFingerprint,
      sessionId: domainMasterNode.sessionId,
      clusterId: '00000000-0000-4000-8000-000000000010',
      endpoint: {
        hostname: domainMasterNode.hostname,
        port: domainMasterNode.port,
        scheme: domainMasterNode.scheme
      }
    });
  });

  test('maps vote requests and responses', () => {
    expect(
      mapGrpcRequestVoteRequestToRequestVoteInternodeInput(
        {
          epoch: '3',
          last_log_sequence: '4',
          caller_master_id: domainMasterNode.id,
          caller_session_id: domainMasterNode.sessionId,
          last_log_epoch: '2'
        },
        callerCertificateFingerprint
      )
    ).toEqual({
      epoch: 3n,
      lastLogEpoch: 2n,
      lastLogSequence: 4n,
      callerMasterNodeId: domainMasterNode.id,
      callerMasterNodeSessionId: domainMasterNode.sessionId,
      callerCertificateFingerprint
    });
    expect(
      mapGrpcRequestVoteResponseToRequestVoteResult({
        epoch: '2',
        vote_granted: false
      })
    ).toEqual({
      epoch: 2n,
      voteGranted: false
    });
  });

  test('maps leader heartbeat requests and responses', () => {
    expect(
      mapGrpcRecordLeaderHeartbeatRequestToRecordLeaderHeartbeatInternodeInput(
        {
          epoch: '3',
          last_committed_sequence: '4',
          caller_master_id: domainMasterNode.id,
          caller_session_id: domainMasterNode.sessionId
        },
        callerCertificateFingerprint
      )
    ).toEqual({
      epoch: 3n,
      lastCommittedSequence: 4n,
      callerMasterNodeId: domainMasterNode.id,
      callerMasterNodeSessionId: domainMasterNode.sessionId,
      callerCertificateFingerprint
    });
    expect(
      mapGrpcRecordLeaderHeartbeatResponseToRecordLeaderHeartbeatResult({
        epoch: '3',
        accepted: true
      })
    ).toEqual({
      epoch: 3n,
      accepted: true
    });
  });

  test('maps task entries between application and gRPC representations', () => {
    const grpcEntry = mapInternodeTaskEntryToGrpcTaskEntry(taskEntry);

    expect(grpcEntry).toEqual({
      id: taskEntry.id,
      origin_master_id: taskEntry.originMasterNodeId,
      epoch: '2',
      sequence: '4',
      type: taskEntry.type,
      execution_scope: TaskExecutionScope.TASK_EXECUTION_SCOPE_CLUSTER,
      data: Buffer.from(JSON.stringify(taskEntry.data)),
      payload_id: taskEntry.payloadId,
      created_at: taskEntry.createdAt
    });
    expect(mapGrpcTaskEntryToInternodeTaskEntry(grpcEntry)).toEqual(taskEntry);
  });

  test('maps local and cluster execution scopes in both directions', () => {
    expect(mapTaskExecutionScopeToGrpcTaskExecutionScope('local')).toBe(TaskExecutionScope.TASK_EXECUTION_SCOPE_LOCAL);
    expect(mapTaskExecutionScopeToGrpcTaskExecutionScope('cluster')).toBe(
      TaskExecutionScope.TASK_EXECUTION_SCOPE_CLUSTER
    );
    expect(mapGrpcTaskExecutionScopeToTaskExecutionScope(TaskExecutionScope.TASK_EXECUTION_SCOPE_LOCAL)).toBe('local');
    expect(mapGrpcTaskExecutionScopeToTaskExecutionScope(TaskExecutionScope.TASK_EXECUTION_SCOPE_CLUSTER)).toBe(
      'cluster'
    );
  });

  test('rejects unspecified and unrecognized execution scopes', () => {
    expect(() =>
      mapGrpcTaskExecutionScopeToTaskExecutionScope(TaskExecutionScope.TASK_EXECUTION_SCOPE_UNSPECIFIED)
    ).toThrow(GenericMapperError);
    expect(() => mapGrpcTaskExecutionScopeToTaskExecutionScope(TaskExecutionScope.UNRECOGNIZED)).toThrow(
      GenericMapperError
    );
  });

  test('wraps malformed task-entry requests and payload data in mapper errors', () => {
    expect(() =>
      mapGrpcFetchTaskEntriesRequestToFetchTaskEntriesInternodeInput(
        {
          after_sequence: 'invalid',
          limit: 32,
          caller_master_id: domainMasterNode.id,
          caller_session_id: domainMasterNode.sessionId
        },
        callerCertificateFingerprint
      )
    ).toThrow(GenericMapperError);
    expect(() =>
      mapGrpcFetchTaskPayloadRequestToFetchTaskPayloadInternodeInput(
        {
          payload_id: 'invalid',
          caller_master_id: domainMasterNode.id,
          caller_session_id: domainMasterNode.sessionId
        },
        callerCertificateFingerprint
      )
    ).toThrow(GenericMapperError);
    expect(() =>
      mapGrpcTaskEntryToInternodeTaskEntry({
        ...mapInternodeTaskEntryToGrpcTaskEntry(taskEntry),
        data: Buffer.from('invalid json')
      })
    ).toThrow(GenericMapperError);
  });
});
