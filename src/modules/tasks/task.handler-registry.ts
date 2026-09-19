import { GenericConflictError, GenericNotFoundError } from '@/errors/application.errors';

import type { TaskDefinitionContract } from './task.definition';
import type { Task, TaskExecutionScope, TaskType } from './task.domain';

/* contract */

// task handlers may be invoked more than once for the same task,
// therefore implementations must be idempotent and safe to retry
type TaskHandler<
  TType extends string = string,
  TData = unknown,
  TScope extends TaskExecutionScope = TaskExecutionScope,
  TResult = unknown
> = (task: Task<TType, TData, TScope>) => Promise<TResult>;

type RegisteredTaskHandler = {
  definition: TaskDefinitionContract<string, unknown, unknown, TaskExecutionScope, unknown>;
  handler: TaskHandler;
};

type TaskHandlerRegistryContract = {
  register<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope, TResult>(
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, TResult>,
    handler: TaskHandler<TType, TData, TScope, TResult>
  ): void;
  resolve<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope, TResult>(
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, TResult>
  ): TaskHandler<TType, TData, TScope, TResult>;
  resolveByType(type: TaskType): RegisteredTaskHandler;
};

/* registry */

class InMemoryTaskHandlerRegistry implements TaskHandlerRegistryContract {
  private readonly registrations = new Map<TaskType, RegisteredTaskHandler>();

  register<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope, TResult>(
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, TResult>,
    handler: TaskHandler<TType, TData, TScope, TResult>
  ): void {
    if (this.registrations.has(definition.type)) {
      throw new GenericConflictError(`Task handler is already registered for type ${definition.type}`);
    }

    this.registrations.set(definition.type, {
      definition: definition as TaskDefinitionContract<string, unknown, unknown, TaskExecutionScope, unknown>,
      handler: handler as TaskHandler
    });
  }

  resolve<TType extends string, TData, TPersistedData, TScope extends TaskExecutionScope, TResult>(
    definition: TaskDefinitionContract<TType, TData, TPersistedData, TScope, TResult>
  ): TaskHandler<TType, TData, TScope, TResult> {
    const registration = this.resolveByType(definition.type);

    if (registration.definition !== definition) {
      throw new GenericConflictError(
        `Task definition does not match the registered definition for type ${definition.type}`
      );
    }

    return registration.handler as TaskHandler<TType, TData, TScope, TResult>;
  }

  resolveByType(type: TaskType): RegisteredTaskHandler {
    const registration = this.registrations.get(type);

    if (!registration) {
      throw new GenericNotFoundError(`No task handler registered for type ${type}`);
    }

    return registration;
  }
}

/* exports */

export { InMemoryTaskHandlerRegistry };
export type { RegisteredTaskHandler, TaskHandler, TaskHandlerRegistryContract };
