import { z } from 'zod';

import { jsonBigIntCodec } from '@/common/serializers/bigint.serializer';
import { jsonDateCodec } from '@/common/serializers/date.serializer';
import { createTaskDefinition } from '@/modules/tasks/task.definition';

import {
  dataNodeCertificateFingerprintSchema,
  dataNodeEndpointSchema,
  dataNodeIdSchema,
  dataNodeSessionIdSchema,
  dataNodeStateSchema,
  type DataNodeSessionId
} from './data-node.domain';

/* data schemas */

export const registerDataNodeTaskDataSchema = z.object({
  id: dataNodeIdSchema,

  certificateFingerprint: dataNodeCertificateFingerprintSchema,
  sessionId: dataNodeSessionIdSchema,
  state: z.literal('joining'),

  endpoint: dataNodeEndpointSchema,

  storageTotalBytes: jsonBigIntCodec,
  storageFreeBytes: jsonBigIntCodec,

  lastContactAt: jsonDateCodec,

  expectedRevision: jsonBigIntCodec.nullable()
});

export const applyDataNodeHeartbeatTaskDataSchema = z.object({
  id: dataNodeIdSchema,

  certificateFingerprint: dataNodeCertificateFingerprintSchema,
  sessionId: dataNodeSessionIdSchema,
  heartbeatSequence: jsonBigIntCodec.pipe(z.bigint().positive()),
  state: dataNodeStateSchema,

  storageTotalBytes: jsonBigIntCodec,
  storageFreeBytes: jsonBigIntCodec,

  lastContactAt: jsonDateCodec,
  lastHeartbeatAt: jsonDateCodec
});

export const recordDataNodeHealthCheckTaskDataSchema = z.object({
  id: dataNodeIdSchema,

  lastHealthCheckAt: jsonDateCodec,

  expectedRevision: jsonBigIntCodec
});

export const updateDataNodeStateTaskDataSchema = z.object({
  id: dataNodeIdSchema,

  state: dataNodeStateSchema,

  expectedRevision: jsonBigIntCodec
});

/* definitions */

export const registerDataNodeTaskDefinition = createTaskDefinition<RegisterDataNodeTaskData, DataNodeSessionId>({
  type: 'data-node.register',
  executionScope: 'cluster',
  dataSchema: registerDataNodeTaskDataSchema
});

export const applyDataNodeHeartbeatTaskDefinition = createTaskDefinition<ApplyDataNodeHeartbeatTaskData, boolean>({
  type: 'data-node.apply-heartbeat',
  executionScope: 'cluster',
  dataSchema: applyDataNodeHeartbeatTaskDataSchema
});

export const recordDataNodeHealthCheckTaskDefinition = createTaskDefinition<RecordDataNodeHealthCheckTaskData, boolean>(
  {
    type: 'data-node.record-health-check',
    executionScope: 'cluster',
    dataSchema: recordDataNodeHealthCheckTaskDataSchema
  }
);

export const updateDataNodeStateTaskDefinition = createTaskDefinition<UpdateDataNodeStateTaskData, boolean>({
  type: 'data-node.update-state',
  executionScope: 'cluster',
  dataSchema: updateDataNodeStateTaskDataSchema
});

export const dataNodeTaskSchema = z.discriminatedUnion('type', [
  registerDataNodeTaskDefinition.taskSchema,
  applyDataNodeHeartbeatTaskDefinition.taskSchema,
  recordDataNodeHealthCheckTaskDefinition.taskSchema,
  updateDataNodeStateTaskDefinition.taskSchema
]);

/* types */

export type RegisterDataNodeTaskData = z.infer<typeof registerDataNodeTaskDataSchema>;
export type ApplyDataNodeHeartbeatTaskData = z.infer<typeof applyDataNodeHeartbeatTaskDataSchema>;
export type RecordDataNodeHealthCheckTaskData = z.infer<typeof recordDataNodeHealthCheckTaskDataSchema>;
export type UpdateDataNodeStateTaskData = z.infer<typeof updateDataNodeStateTaskDataSchema>;

export type RegisterDataNodeTask = z.infer<typeof registerDataNodeTaskDefinition.taskSchema>;
export type ApplyDataNodeHeartbeatTask = z.infer<typeof applyDataNodeHeartbeatTaskDefinition.taskSchema>;
export type RecordDataNodeHealthCheckTask = z.infer<typeof recordDataNodeHealthCheckTaskDefinition.taskSchema>;
export type UpdateDataNodeStateTask = z.infer<typeof updateDataNodeStateTaskDefinition.taskSchema>;

export type DataNodeTask = z.infer<typeof dataNodeTaskSchema>;
