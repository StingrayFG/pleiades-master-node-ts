import { Readable } from 'node:stream';

import { GenericFailedPreconditionError } from '@/errors/application.errors';
import type { ObjectVersionPartTaskHandlerContract } from '@/modules/object-version-parts/object-version-part.task-handler';
import type { TaskDefinitionHandler, TaskDefinitionTask } from '@/modules/tasks/task.definition';

import type { CreateObjectResult } from './object.application';
import type { ObjectRepositoryContract } from './object.repository';
import type { createObjectTaskDefinition } from './object.tasks';

/* contract */

type ObjectTaskHandlerContract = {
  createObject: TaskDefinitionHandler<typeof createObjectTaskDefinition>;
};

/* handler */

class ObjectTaskHandler implements ObjectTaskHandlerContract {
  constructor(
    private readonly repository: ObjectRepositoryContract,
    private readonly objectVersionPartTaskHandler: ObjectVersionPartTaskHandlerContract
  ) {}

  async createObject(task: TaskDefinitionTask<typeof createObjectTaskDefinition>): Promise<CreateObjectResult> {
    const objectVersionAllocation = await this.repository.upsertObjectAndCreateVersion({
      objectKey: task.data.objectKey,
      bucketId: task.data.bucketId,

      totalSizeBytes: task.data.totalSizeBytes,
      contentType: task.data.contentType
    });

    await this.objectVersionPartTaskHandler.createPartsFromData({
      objectId: objectVersionAllocation.object.id,
      version: objectVersionAllocation.objectVersion.version,

      totalSizeBytes: task.data.totalSizeBytes,

      data: Readable.from([task.data.data])
    });

    try {
      const objectVersionCommit = await this.repository.commitObjectVersion({
        objectId: objectVersionAllocation.object.id,
        version: objectVersionAllocation.objectVersion.version
      });

      return {
        object: objectVersionCommit.object,
        objectVersion: objectVersionCommit.objectVersion
      };
    } catch (err) {
      if (!(err instanceof GenericFailedPreconditionError)) {
        throw err;
      }

      const object = await this.repository.findObjectById(objectVersionAllocation.object.id);

      const objectVersion = await this.repository.findObjectVersion(
        objectVersionAllocation.object.id,
        objectVersionAllocation.objectVersion.version
      );

      if (!object || !objectVersion) {
        throw err;
      }

      return {
        object,
        objectVersion
      };
    }
  }
}

/* exports */

export { ObjectTaskHandler };
export type { ObjectTaskHandlerContract };
