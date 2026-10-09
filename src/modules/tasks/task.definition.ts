import type { Buffer } from 'node:buffer';

import { z } from 'zod';

import { taskBaseSchema, type TaskExecutionScope } from './task.domain';

/* contract */

type SimpleTaskDefinition<TType extends string, TScope extends TaskExecutionScope, TData, TResult> = {
  type: TType;
  executionScope: TScope;
  forwardable: boolean;

  dataSchema: z.ZodType<TData>;

  // simple definitions persist the full task data without a separate payload,
  // so TData must be inferred from dataSchema rather than persistedDataSchema.
  persistedDataSchema: z.ZodType<NoInfer<TData>>;

  taskSchema: TaskSchema<TType, TScope, TData>;

  // defines the wire schema for handler results returned from the leader
  // to the forwarding follower.
  resultSchema?: z.ZodType<TResult>;

  // associates this definition with its handler result type at compile time only.
  readonly __resultType?: TResult;
};

type DehydratedTaskData<TPersistedData> = {
  data: TPersistedData;
  payload: Buffer;
};

type DehydratedTaskDefinition<
  TType extends string,
  TScope extends TaskExecutionScope,
  TData,
  TPersistedData,
  TResult
> = {
  type: TType;
  executionScope: TScope;
  forwardable: boolean;

  dataSchema: z.ZodType<TData>;
  persistedDataSchema: z.ZodType<TPersistedData>;
  dehydrateData(data: TData): DehydratedTaskData<TPersistedData>;
  hydrateData(data: TPersistedData, payload: Buffer): TData;

  taskSchema: TaskSchema<TType, TScope, TData>;

  // defines the wire schema for handler results returned from the leader
  // to the forwarding follower.
  resultSchema?: z.ZodType<TResult>;

  // associates this definition with its handler result type at compile time only.
  readonly __resultType?: TResult;
};

type TaskDefinition<
  TType extends string = string,
  TScope extends TaskExecutionScope = TaskExecutionScope,
  TData = unknown,
  TPersistedData = TData,
  TResult = unknown
> =
  | SimpleTaskDefinition<TType, TScope, TData, TResult>
  | DehydratedTaskDefinition<TType, TScope, TData, TPersistedData, TResult>;

type CreateTaskDefinitionInput<
  TType extends string,
  TScope extends TaskExecutionScope,
  TDataSchema extends z.ZodTypeAny
> = {
  type: TType;
  executionScope: TScope;
  forwardable?: boolean;

  dataSchema: TDataSchema;
};

type CreateDehydratedTaskDefinitionInput<
  TType extends string,
  TScope extends TaskExecutionScope,
  TDataSchema extends z.ZodTypeAny,
  TPersistedDataSchema extends z.ZodTypeAny
> = CreateTaskDefinitionInput<TType, TScope, TDataSchema> & {
  persistedDataSchema: TPersistedDataSchema;

  dehydrateData(data: z.output<TDataSchema>): DehydratedTaskData<z.output<TPersistedDataSchema>>;
  hydrateData(data: z.output<TPersistedDataSchema>, payload: Buffer): z.output<TDataSchema>;
};

/* derived types */

type TaskDefinitionData<TDefinition extends { dataSchema: z.ZodTypeAny }> = z.output<TDefinition['dataSchema']>;

type TaskDefinitionResult<TDefinition extends { __resultType?: unknown }> = Exclude<
  TDefinition['__resultType'],
  undefined
>;

type TaskDefinitionTask<TDefinition extends { taskSchema: z.ZodTypeAny }> = z.output<TDefinition['taskSchema']>;

// task handlers may run more than once for the same task, so they must be
// idempotent and safe to retry.
type TaskDefinitionHandler<TDefinition extends { __resultType?: unknown; taskSchema: z.ZodTypeAny }> = (
  task: TaskDefinitionTask<TDefinition>
) => Promise<TaskDefinitionResult<TDefinition>>;

/* helpers */

const isDehydratedTaskDefinition = (
  definition: TaskDefinition<string, TaskExecutionScope, unknown, unknown, unknown>
): definition is DehydratedTaskDefinition<string, TaskExecutionScope, unknown, unknown, unknown> =>
  'dehydrateData' in definition;

const createTaskSchema = <TType extends string, TScope extends TaskExecutionScope, TData>(definition: {
  type: TType;
  executionScope: TScope;

  dataSchema: z.ZodType<TData>;
}) => {
  return taskBaseSchema.extend({
    type: z.literal(definition.type),
    executionScope: z.literal(definition.executionScope),

    data: definition.dataSchema
  });
};

type TaskSchema<TType extends string, TScope extends TaskExecutionScope, TData> = ReturnType<
  typeof createTaskSchema<TType, TScope, TData>
>;

/* factories */

function createTaskDefinition<
  TType extends string,
  TScope extends TaskExecutionScope,
  TDataSchema extends z.ZodTypeAny,
  TResultSchema extends z.ZodTypeAny
>(
  definition: CreateTaskDefinitionInput<TType, TScope, TDataSchema> & {
    resultSchema: TResultSchema;
  }
): SimpleTaskDefinition<TType, TScope, z.output<TDataSchema>, z.output<TResultSchema>>;
function createTaskDefinition<
  TType extends string,
  TScope extends TaskExecutionScope,
  TDataSchema extends z.ZodTypeAny
>(
  definition: CreateTaskDefinitionInput<TType, TScope, TDataSchema> & {
    resultSchema?: never;
  }
): SimpleTaskDefinition<TType, TScope, z.output<TDataSchema>, void>;
function createTaskDefinition(
  definition: CreateTaskDefinitionInput<string, TaskExecutionScope, z.ZodTypeAny> & {
    resultSchema?: z.ZodTypeAny;
  }
): unknown {
  const taskSchema = createTaskSchema(definition);

  const taskDefinition = {
    type: definition.type,
    executionScope: definition.executionScope,
    forwardable: definition.forwardable ?? true,

    dataSchema: definition.dataSchema,
    persistedDataSchema: definition.dataSchema,

    resultSchema: definition.resultSchema
  };

  return { ...taskDefinition, taskSchema };
}

function createDehydratedTaskDefinition<
  TType extends string,
  TScope extends TaskExecutionScope,
  TDataSchema extends z.ZodTypeAny,
  TPersistedDataSchema extends z.ZodTypeAny,
  TResultSchema extends z.ZodTypeAny
>(
  definition: CreateDehydratedTaskDefinitionInput<TType, TScope, TDataSchema, TPersistedDataSchema> & {
    resultSchema: TResultSchema;
  }
): DehydratedTaskDefinition<
  TType,
  TScope,
  z.output<TDataSchema>,
  z.output<TPersistedDataSchema>,
  z.output<TResultSchema>
>;
function createDehydratedTaskDefinition<
  TType extends string,
  TScope extends TaskExecutionScope,
  TDataSchema extends z.ZodTypeAny,
  TPersistedDataSchema extends z.ZodTypeAny
>(
  definition: CreateDehydratedTaskDefinitionInput<TType, TScope, TDataSchema, TPersistedDataSchema> & {
    resultSchema?: never;
  }
): DehydratedTaskDefinition<TType, TScope, z.output<TDataSchema>, z.output<TPersistedDataSchema>, void>;
function createDehydratedTaskDefinition(
  definition: CreateDehydratedTaskDefinitionInput<string, TaskExecutionScope, z.ZodTypeAny, z.ZodTypeAny> & {
    resultSchema?: z.ZodTypeAny;
  }
): unknown {
  const taskSchema = createTaskSchema(definition);

  const taskDefinition = {
    type: definition.type,
    executionScope: definition.executionScope,
    forwardable: definition.forwardable ?? true,

    dataSchema: definition.dataSchema,
    persistedDataSchema: definition.persistedDataSchema,
    dehydrateData: definition.dehydrateData,
    hydrateData: definition.hydrateData,

    resultSchema: definition.resultSchema
  };

  return { ...taskDefinition, taskSchema };
}

/* exports */

export { createTaskDefinition, createDehydratedTaskDefinition, isDehydratedTaskDefinition };
export type {
  SimpleTaskDefinition,
  DehydratedTaskData,
  DehydratedTaskDefinition,
  TaskDefinition,
  CreateTaskDefinitionInput,
  CreateDehydratedTaskDefinitionInput,
  TaskDefinitionData,
  TaskDefinitionResult,
  TaskDefinitionTask,
  TaskDefinitionHandler
};
