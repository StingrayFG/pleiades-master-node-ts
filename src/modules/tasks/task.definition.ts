import type { Buffer } from 'node:buffer';

import { z } from 'zod';

import { taskBaseSchema, type TaskExecutionScope } from './task.domain';

/* contract */

type DehydratedTaskData<TPersistedData> = {
  data: TPersistedData;
  payload: Buffer;
};

type SimpleTaskDefinition<TType extends string, TData, TScope extends TaskExecutionScope, TResult> = {
  type: TType;
  dataSchema: z.ZodType<TData>;
  executionScope: TScope;

  // no persisted data and payload split; persisted data is the full data,
  // so TData must always be inferred from dataSchema instead of this schema
  persistedDataSchema: z.ZodType<NoInfer<TData>>;

  // compile-time only marker that associates this definition with the handler result type
  readonly __resultType?: TResult;
};

type DehydratedTaskDefinition<
  TType extends string,
  TData,
  TPersistedData,
  TScope extends TaskExecutionScope,
  TResult
> = {
  type: TType;
  dataSchema: z.ZodType<TData>;
  executionScope: TScope;

  persistedDataSchema: z.ZodType<TPersistedData>;

  dehydrateData(data: TData): DehydratedTaskData<TPersistedData>;
  hydrateData(data: TPersistedData, payload: Buffer): TData;

  // compile-time only marker that associates this definition with the handler result type
  readonly __resultType?: TResult;
};

type TaskDefinitionContract<
  TType extends string = string,
  TData = unknown,
  TPersistedData = TData,
  TScope extends TaskExecutionScope = TaskExecutionScope,
  TResult = unknown
> =
  | SimpleTaskDefinition<TType, TData, TScope, TResult>
  | DehydratedTaskDefinition<TType, TData, TPersistedData, TScope, TResult>;

type CreateTaskDefinitionInput<TType extends string, TData, TScope extends TaskExecutionScope> = {
  type: TType;
  dataSchema: z.ZodType<TData>;
  executionScope: TScope;
};

type CreateDehydratedTaskDefinitionInput<
  TType extends string,
  TData,
  TPersistedData,
  TScope extends TaskExecutionScope
> = CreateTaskDefinitionInput<TType, TData, TScope> & {
  persistedDataSchema: z.ZodType<TPersistedData>;
  dehydrateData(data: TData): DehydratedTaskData<TPersistedData>;
  hydrateData(data: TPersistedData, payload: Buffer): TData;
};

/* derived types */

type TaskDefinitionData<TDefinition extends { dataSchema: z.ZodTypeAny }> = z.infer<TDefinition['dataSchema']>;

type TaskDefinitionTask<TDefinition extends { taskSchema: z.ZodTypeAny }> = z.infer<TDefinition['taskSchema']>;

type TaskDefinitionResult<TDefinition extends { __resultType?: unknown }> = Exclude<
  TDefinition['__resultType'],
  undefined
>;

type TaskDefinitionHandler<TDefinition extends { __resultType?: unknown; taskSchema: z.ZodTypeAny }> = (
  task: TaskDefinitionTask<TDefinition>
) => Promise<TaskDefinitionResult<TDefinition>>;

/* helpers */

const isDehydratedTaskDefinition = (
  definition: TaskDefinitionContract<string, unknown, unknown, TaskExecutionScope, unknown>
): definition is DehydratedTaskDefinition<string, unknown, unknown, TaskExecutionScope, unknown> =>
  'dehydrateData' in definition;

const createTaskSchema = <TType extends string, TData, TScope extends TaskExecutionScope>(definition: {
  type: TType;
  dataSchema: z.ZodType<TData>;
  executionScope: TScope;
}) => {
  return taskBaseSchema.extend({
    type: z.literal(definition.type),
    data: definition.dataSchema,
    executionScope: z.literal(definition.executionScope)
  });
};

/* factories */

const createTaskDefinition = <
  TData,
  TResult,
  TType extends string = string,
  TScope extends TaskExecutionScope = TaskExecutionScope
>(
  definition: CreateTaskDefinitionInput<TType, TData, TScope>
) => {
  const taskSchema = createTaskSchema(definition);

  const taskDefinition: SimpleTaskDefinition<TType, TData, TScope, TResult> = {
    type: definition.type,
    dataSchema: definition.dataSchema,
    executionScope: definition.executionScope,

    persistedDataSchema: definition.dataSchema
  };

  return { ...taskDefinition, taskSchema };
};

const createDehydratedTaskDefinition = <
  TData,
  TPersistedData,
  TResult,
  TType extends string = string,
  TScope extends TaskExecutionScope = TaskExecutionScope
>(
  definition: CreateDehydratedTaskDefinitionInput<TType, TData, TPersistedData, TScope>
) => {
  const taskSchema = createTaskSchema(definition);

  const taskDefinition: DehydratedTaskDefinition<TType, TData, TPersistedData, TScope, TResult> = {
    type: definition.type,
    dataSchema: definition.dataSchema,
    executionScope: definition.executionScope,

    persistedDataSchema: definition.persistedDataSchema,
    dehydrateData: definition.dehydrateData,
    hydrateData: definition.hydrateData
  };

  return { ...taskDefinition, taskSchema };
};

/* exports */

export { createTaskDefinition, createDehydratedTaskDefinition, isDehydratedTaskDefinition };
export type {
  DehydratedTaskData,
  SimpleTaskDefinition,
  DehydratedTaskDefinition,
  TaskDefinitionContract,
  CreateTaskDefinitionInput,
  CreateDehydratedTaskDefinitionInput,
  TaskDefinitionData,
  TaskDefinitionTask,
  TaskDefinitionResult,
  TaskDefinitionHandler
};
