import { GenericConflictError, GenericNotFoundError } from '@/errors/application.errors';

import type { TaskDefinition, TaskDefinitionHandler } from './task.definition';
import type { TaskType } from './task.domain';

/* contract */

type RegisteredTaskHandler = {
  definition: TaskDefinition;
  handler: TaskDefinitionHandler<TaskDefinition>;
};

type TaskHandlerRegistryContract = {
  register<TDefinition extends TaskDefinition>(
    definition: TDefinition,
    handler: TaskDefinitionHandler<TDefinition>
  ): void;
  resolve<TDefinition extends TaskDefinition>(
    definition: TDefinition
  ): TaskDefinitionHandler<TDefinition>;
  resolveByType(type: TaskType): RegisteredTaskHandler;
};

/* registry */

class InMemoryTaskHandlerRegistry implements TaskHandlerRegistryContract {
  private readonly registrations = new Map<TaskType, RegisteredTaskHandler>();

  register<TDefinition extends TaskDefinition>(
    definition: TDefinition,
    handler: TaskDefinitionHandler<TDefinition>
  ): void {
    if (this.registrations.has(definition.type)) {
      throw new GenericConflictError(`Task handler is already registered for type ${definition.type}`);
    }

    this.registrations.set(definition.type, {
      definition,
      handler: handler as TaskDefinitionHandler<TaskDefinition>
    });
  }

  resolve<TDefinition extends TaskDefinition>(
    definition: TDefinition
  ): TaskDefinitionHandler<TDefinition> {
    const registration = this.resolveByType(definition.type);

    if (registration.definition !== definition) {
      throw new GenericConflictError(
        `Task definition does not match the registered definition for type ${definition.type}`
      );
    }

    return registration.handler as TaskDefinitionHandler<TDefinition>;
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
export type { RegisteredTaskHandler, TaskHandlerRegistryContract };
