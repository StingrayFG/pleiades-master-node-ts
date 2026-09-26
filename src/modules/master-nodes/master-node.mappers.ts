import { Buffer } from 'node:buffer';

import type { MasterNode as PrismaMasterNode } from '@prisma/client';

import { withMapperError } from '@/common/mappers/mappers';
import { GenericMapperError } from '@/errors/application.errors';
import {
  TaskExecutionScope as GrpcTaskExecutionScope,
  type FetchMasterInfoResponse,
  type FetchTaskEntriesRequest,
  type FetchTaskPayloadRequest,
  type ForwardTaskRequest,
  type RegisterMasterNodeRequest,
  type TaskEntry as GrpcTaskEntry
} from '@/gen/proto/master/v1/master';
import type { TaskExecutionScope } from '@/modules/tasks/task.domain';

import {
  fetchMasterInfoInternodeResultSchema,
  fetchTaskEntriesInternodeInputSchema,
  fetchTaskPayloadInternodeInputSchema,
  forwardTaskInternodeInputSchema,
  internodeTaskEntrySchema,
  registerMasterNodeInternodeInputSchema,
  type FetchMasterInfoInternodeResult,
  type FetchTaskEntriesInternodeInput,
  type FetchTaskPayloadInternodeInput,
  type ForwardTaskInternodeInput,
  type InternodeTaskEntry,
  type RegisterMasterNodeInternodeInput
} from './master-node.application';
import { masterNodeSchema, type MasterNode, type MasterNodeCertificateFingerprint } from './master-node.domain';

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
