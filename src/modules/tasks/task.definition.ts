import { z } from 'zod';

import { taskBaseSchema, type TaskExecutionScope } from './task.domain';

/* contract */

type CreateTaskDefinitionInput<TType extends string, TData, TScope extends TaskExecutionScope> = {
  type: TType;
  dataSchema: z.ZodType<TData>;
  executionScope: TScope;
};

type TaskDefinitionContract<
  TType extends string = string,
  TData = unknown,
  TScope extends TaskExecutionScope = TaskExecutionScope,
  TResult = unknown
> = CreateTaskDefinitionInput<TType, TData, TScope> & {
  // compile-time only marker that associates this definition with the handler result type
  readonly __resultType?: TResult;
};

/* derived types */

type TaskDefinitionData<TDefinition extends { dataSchema: z.ZodTypeAny }> = z.infer<TDefinition['dataSchema']>;

type TaskDefinitionResult<TDefinition extends { __resultType?: unknown }> = Exclude<
  TDefinition['__resultType'],
  undefined
>;

type TaskDefinitionTask<TDefinition extends { taskSchema: z.ZodTypeAny }> = z.infer<TDefinition['taskSchema']>;

type TaskDefinitionHandler<TDefinition extends { __resultType?: unknown; taskSchema: z.ZodTypeAny }> = (
  task: TaskDefinitionTask<TDefinition>
) => Promise<TaskDefinitionResult<TDefinition>>;

/* helpers */

const createTaskSchema = <TType extends string, TData, TScope extends TaskExecutionScope>(
  definition: CreateTaskDefinitionInput<TType, TData, TScope>
) => {
  return taskBaseSchema.extend({
    type: z.literal(definition.type),
    data: definition.dataSchema,
    executionScope: z.literal(definition.executionScope)
  });
};

/* factory */

const createTaskDefinition = <
  TData,
  TResult,
  TType extends string = string,
  TScope extends TaskExecutionScope = TaskExecutionScope
>(
  definition: CreateTaskDefinitionInput<TType, TData, TScope>
) => {
  const taskSchema = createTaskSchema(definition);

  const taskDefinition: TaskDefinitionContract<TType, TData, TScope, TResult> = {
    type: definition.type,
    dataSchema: definition.dataSchema,
    executionScope: definition.executionScope
  };

  return { ...taskDefinition, taskSchema };
};

/* exports */

export { createTaskDefinition };
export type {
  CreateTaskDefinitionInput,
  TaskDefinitionContract,
  TaskDefinitionHandler,
  TaskDefinitionData,
  TaskDefinitionResult,
  TaskDefinitionTask
};
