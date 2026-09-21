import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { GenericDataLossError, GenericInternalServerError } from '@/errors/application.errors';

import type { IdentityConfig } from './identity.config';
import { nodeIdSchema, type NodeId } from './identity.domain';

/* contract */

type IdentityRepositoryContract = {
  findNodeId(): NodeId | null;
  createNodeId(id: NodeId): boolean;
};

/* helpers */

const hasFileSystemErrorCode = (err: unknown, code: string): err is NodeJS.ErrnoException => {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === code;
};

/* repository */

class IdentityRepository implements IdentityRepositoryContract {
  constructor(private readonly config: IdentityConfig) {}

  findNodeId(): NodeId | null {
    let rawNodeId;

    try {
      rawNodeId = readFileSync(this.config.nodeIdPath, 'utf8');
    } catch (err) {
      if (hasFileSystemErrorCode(err, 'ENOENT')) {
        return null;
      }

      throw new GenericInternalServerError('Failed to read the persisted node ID', { cause: err });
    }

    const nodeIdResult = nodeIdSchema.safeParse(rawNodeId.trim());

    if (!nodeIdResult.success) {
      throw new GenericDataLossError('The persisted node ID is invalid', { cause: nodeIdResult.error });
    }

    return nodeIdResult.data;
  }

  createNodeId(id: NodeId): boolean {
    try {
      mkdirSync(dirname(this.config.nodeIdPath), {
        recursive: true,
        mode: 0o755
      });
    } catch (err) {
      throw new GenericInternalServerError('Failed to initialize the node ID directory', { cause: err });
    }

    try {
      writeFileSync(this.config.nodeIdPath, `${id}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o644
      });
    } catch (err) {
      if (hasFileSystemErrorCode(err, 'EEXIST')) {
        return false;
      }

      throw new GenericInternalServerError('Failed to persist the node ID', { cause: err });
    }

    return true;
  }
}

/* exports */

export { IdentityRepository };
export type { IdentityRepositoryContract };
