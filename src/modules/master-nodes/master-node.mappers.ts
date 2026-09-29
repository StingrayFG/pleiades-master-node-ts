import { Buffer } from 'node:buffer';

import type { MasterNode as PrismaMasterNode } from '@prisma/client';

import { withMapperError } from '@/common/mappers/mappers';
import { GenericMapperError } from '@/errors/application.errors';
import {
  TaskExecutionScope as GrpcTaskExecutionScope,
  type FetchMasterInfoResponse,
  type RegisterMasterNodeRequest,
  type FetchClusterMembershipSnapshotRequest,
  type FetchTaskEntriesRequest,
  type FetchTaskPayloadRequest,
  type ForwardTaskRequest,
  type RequestVoteRequest,
  type RequestVoteResponse,
  type RecordLeaderHeartbeatRequest,
  type RecordLeaderHeartbeatResponse,
  type TaskEntry as GrpcTaskEntry
} from '@/gen/proto/master/v1/master';
import {
  recordLeaderHeartbeatResultSchema,
  requestVoteResultSchema,
  type RecordLeaderHeartbeatResult,
  type RequestVoteResult
} from '@/modules/election/election.application';
import type { TaskExecutionScope } from '@/modules/tasks/task.domain';

import {
  internodeTaskEntrySchema,
  fetchMasterInfoInternodeResultSchema,
  registerMasterNodeInternodeInputSchema,
  fetchClusterMembershipSnapshotInternodeInputSchema,
  fetchTaskEntriesInternodeInputSchema,
  fetchTaskPayloadInternodeInputSchema,
  forwardTaskInternodeInputSchema,
  requestVoteInternodeInputSchema,
  recordLeaderHeartbeatInternodeInputSchema,
  type InternodeTaskEntry,
  type FetchMasterInfoInternodeResult,
  type RegisterMasterNodeInternodeInput,
  type FetchClusterMembershipSnapshotInternodeInput,
  type FetchTaskEntriesInternodeInput,
  type FetchTaskPayloadInternodeInput,
  type ForwardTaskInternodeInput,
  type RequestVoteInternodeInput,
  type RecordLeaderHeartbeatInternodeInput
} from './master-node.application';
import {
  masterNodeSchema,
  type MasterNode,
  type MasterNodeCertificateFingerprint,
  type MasterNodeEndpoint
} from './master-node.domain';
import type { MasterNodeResponse, MasterNodesResponse } from './master-node.http-contracts';

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

/* domain */

export const mapMasterNodeToMasterNodeEndpoint = (masterNode: MasterNode): MasterNodeEndpoint => {
  return {
    hostname: masterNode.hostname,
    port: masterNode.port,
    scheme: masterNode.scheme
  };
};

/* domain -> http */

export const mapDomainMasterNodeToHttpMasterNodeResponse = (masterNode: MasterNode): MasterNodeResponse => {
  return withMapperError('Failed to map domain master node to HTTP master node', () => {
    return {
      id: masterNode.id,

      certificateFingerprint: masterNode.certificateFingerprint,
      sessionId: masterNode.sessionId,
      state: masterNode.state,
      mode: masterNode.mode,

      hostname: masterNode.hostname,
      port: masterNode.port,
      scheme: masterNode.scheme,

      registeredAt: masterNode.registeredAt.toISOString(),
      lastContactAt: masterNode.lastContactAt.toISOString(),
      lastHealthCheckAt: masterNode.lastHealthCheckAt?.toISOString() ?? null,
      lastHeartbeatAt: masterNode.lastHeartbeatAt?.toISOString() ?? null,
      updatedAt: masterNode.updatedAt.toISOString(),

      revision: masterNode.revision.toString()
    };
  });
};

export const mapDomainMasterNodesToHttpMasterNodesResponse = (masterNodes: MasterNode[]): MasterNodesResponse => {
  return withMapperError('Failed to map domain master nodes to HTTP master nodes', () => {
    return masterNodes.map(mapDomainMasterNodeToHttpMasterNodeResponse);
  });
};

/* grpc -> application */

export const mapGrpcFetchMasterInfoResponseToFetchMasterInfoInternodeResult = (
  response: FetchMasterInfoResponse
): FetchMasterInfoInternodeResult => {
  return withMapperError('Failed to map gRPC fetch master info response', () => {
    return fetchMasterInfoInternodeResultSchema.parse({
      masterId: response.master_id,
      sessionId: response.session_id,
      clusterId: response.cluster_id,

      epoch: BigInt(response.epoch)
    });
  });
};

export const mapGrpcRegisterMasterNodeRequestToRegisterMasterNodeInternodeInput = (
  request: RegisterMasterNodeRequest,
  certificateFingerprint: MasterNodeCertificateFingerprint
): RegisterMasterNodeInternodeInput => {
  return withMapperError('Failed to map gRPC register master node request', () => {
    return registerMasterNodeInternodeInputSchema.parse({
      id: request.master_id,

      certificateFingerprint,
      sessionId: request.session_id,
      clusterId: request.cluster_id,

      endpoint: {
        hostname: request.hostname,
        port: request.port,
        scheme: request.scheme
      }
    });
  });
};

export const mapGrpcFetchClusterMembershipSnapshotRequestToFetchClusterMembershipSnapshotInternodeInput = (
  request: FetchClusterMembershipSnapshotRequest,
  callerCertificateFingerprint: MasterNodeCertificateFingerprint
): FetchClusterMembershipSnapshotInternodeInput => {
  return withMapperError('Failed to map gRPC fetch cluster membership snapshot request', () => {
    return fetchClusterMembershipSnapshotInternodeInputSchema.parse({
      callerMasterNodeId: request.caller_master_id,
      callerMasterNodeSessionId: request.caller_session_id,
      callerCertificateFingerprint
    });
  });
};

export const mapGrpcFetchTaskEntriesRequestToFetchTaskEntriesInternodeInput = (
  request: FetchTaskEntriesRequest,
  callerCertificateFingerprint: MasterNodeCertificateFingerprint
): FetchTaskEntriesInternodeInput => {
  return withMapperError('Failed to map gRPC fetch task entries request', () => {
    return fetchTaskEntriesInternodeInputSchema.parse({
      callerMasterNodeId: request.caller_master_id,
      callerMasterNodeSessionId: request.caller_session_id,
      callerCertificateFingerprint,

      afterSequence: BigInt(request.after_sequence),
      limit: request.limit
    });
  });
};

export const mapGrpcTaskExecutionScopeToTaskExecutionScope = (scope: GrpcTaskExecutionScope): TaskExecutionScope => {
  switch (scope) {
    case GrpcTaskExecutionScope.TASK_EXECUTION_SCOPE_LOCAL:
      return 'local';
    case GrpcTaskExecutionScope.TASK_EXECUTION_SCOPE_CLUSTER:
      return 'cluster';
    default:
      throw new GenericMapperError(`Unsupported gRPC task execution scope: ${String(scope)}`);
  }
};

export const mapGrpcTaskEntryToInternodeTaskEntry = (entry: GrpcTaskEntry): InternodeTaskEntry => {
  return withMapperError('Failed to map gRPC task entry to internode task entry', () => {
    return internodeTaskEntrySchema.parse({
      id: entry.id,

      originMasterNodeId: entry.origin_master_id,
      epoch: BigInt(entry.epoch),
      sequence: BigInt(entry.sequence),

      type: entry.type,
      executionScope: mapGrpcTaskExecutionScopeToTaskExecutionScope(entry.execution_scope),
      data: JSON.parse(entry.data.toString('utf8')),

      payloadId: entry.payload_id ?? null,

      createdAt: entry.created_at
    });
  });
};

export const mapGrpcFetchTaskPayloadRequestToFetchTaskPayloadInternodeInput = (
  request: FetchTaskPayloadRequest,
  callerCertificateFingerprint: MasterNodeCertificateFingerprint
): FetchTaskPayloadInternodeInput => {
  return withMapperError('Failed to map gRPC fetch task payload request', () => {
    return fetchTaskPayloadInternodeInputSchema.parse({
      payloadId: request.payload_id,

      callerMasterNodeId: request.caller_master_id,
      callerMasterNodeSessionId: request.caller_session_id,
      callerCertificateFingerprint
    });
  });
};

export const mapGrpcForwardTaskRequestToForwardTaskInternodeInput = (
  request: ForwardTaskRequest,
  callerCertificateFingerprint: MasterNodeCertificateFingerprint
): ForwardTaskInternodeInput => {
  return withMapperError('Failed to map gRPC forward task request', () => {
    return forwardTaskInternodeInputSchema.parse({
      type: request.type,
      data: JSON.parse(request.data.toString('utf8')),

      callerMasterNodeId: request.caller_master_id,
      callerMasterNodeSessionId: request.caller_session_id,
      callerCertificateFingerprint
    });
  });
};

export const mapGrpcRequestVoteRequestToRequestVoteInternodeInput = (
  request: RequestVoteRequest,
  callerCertificateFingerprint: MasterNodeCertificateFingerprint
): RequestVoteInternodeInput => {
  return withMapperError('Failed to map gRPC request vote request', () => {
    return requestVoteInternodeInputSchema.parse({
      epoch: BigInt(request.epoch),
      lastLogEpoch: BigInt(request.last_log_epoch),
      lastLogSequence: BigInt(request.last_log_sequence),

      callerMasterNodeId: request.caller_master_id,
      callerMasterNodeSessionId: request.caller_session_id,
      callerCertificateFingerprint
    });
  });
};

export const mapGrpcRequestVoteResponseToRequestVoteResult = (response: RequestVoteResponse): RequestVoteResult => {
  return withMapperError('Failed to map gRPC request vote response', () => {
    return requestVoteResultSchema.parse({
      epoch: BigInt(response.epoch),
      voteGranted: response.vote_granted
    });
  });
};

export const mapGrpcRecordLeaderHeartbeatRequestToRecordLeaderHeartbeatInternodeInput = (
  request: RecordLeaderHeartbeatRequest,
  callerCertificateFingerprint: MasterNodeCertificateFingerprint
): RecordLeaderHeartbeatInternodeInput => {
  return withMapperError('Failed to map gRPC record leader heartbeat request', () => {
    return recordLeaderHeartbeatInternodeInputSchema.parse({
      epoch: BigInt(request.epoch),
      lastCommittedSequence: BigInt(request.last_committed_sequence),

      callerMasterNodeId: request.caller_master_id,
      callerMasterNodeSessionId: request.caller_session_id,
      callerCertificateFingerprint
    });
  });
};

export const mapGrpcRecordLeaderHeartbeatResponseToRecordLeaderHeartbeatResult = (
  response: RecordLeaderHeartbeatResponse
): RecordLeaderHeartbeatResult => {
  return withMapperError('Failed to map gRPC record leader heartbeat response', () => {
    return recordLeaderHeartbeatResultSchema.parse({
      epoch: BigInt(response.epoch),
      lastMatchedSequence: BigInt(response.last_matched_sequence),
      accepted: response.accepted
    });
  });
};

/* application -> grpc */

export const mapTaskExecutionScopeToGrpcTaskExecutionScope = (scope: TaskExecutionScope): GrpcTaskExecutionScope => {
  switch (scope) {
    case 'local':
      return GrpcTaskExecutionScope.TASK_EXECUTION_SCOPE_LOCAL;
    case 'cluster':
      return GrpcTaskExecutionScope.TASK_EXECUTION_SCOPE_CLUSTER;
    default:
      throw new GenericMapperError(`Unsupported task execution scope: ${String(scope)}`);
  }
};

export const mapInternodeTaskEntryToGrpcTaskEntry = (entry: InternodeTaskEntry): GrpcTaskEntry => {
  return withMapperError('Failed to map internode task entry to gRPC task entry', () => {
    return {
      id: entry.id,

      origin_master_id: entry.originMasterNodeId,
      epoch: entry.epoch.toString(),
      sequence: entry.sequence.toString(),

      type: entry.type,
      execution_scope: mapTaskExecutionScopeToGrpcTaskExecutionScope(entry.executionScope),
      data: Buffer.from(JSON.stringify(entry.data)),

      payload_id: entry.payloadId ?? undefined,

      created_at: entry.createdAt
    };
  });
};
