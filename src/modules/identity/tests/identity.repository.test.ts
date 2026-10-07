import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from '@jest/globals';

import { GenericDataLossError, GenericInternalServerError } from '@/errors/application.errors';

import type { IdentityConfig } from '../identity.config';
import { nodeIdSchema } from '../identity.domain';
import { IdentityRepository } from '../identity.repository';

/* fixtures */

const nodeId = nodeIdSchema.parse('master-node-aaaaaaaaaaaa');
const otherNodeId = nodeIdSchema.parse('master-node-bbbbbbbbbbbb');

/* tests */

describe('IdentityRepository', () => {
  let rootPath: string;
  let nodeIdPath: string;
  let repository: IdentityRepository;

  beforeEach(() => {
    rootPath = mkdtempSync(join(tmpdir(), 'pleiades-identity-'));
    nodeIdPath = join(rootPath, 'identity', 'node-id');
    repository = new IdentityRepository({ nodeIdPath });
  });

  afterEach(() => {
    rmSync(rootPath, { recursive: true, force: true });
  });

  test('returns null when the node ID file does not exist', () => {
    expect(repository.findNodeId()).toBeNull();
  });

  test('creates and reads a persisted node ID', () => {
    expect(repository.createNodeId(nodeId)).toBe(true);
    expect(readFileSync(nodeIdPath, 'utf8')).toBe(`${nodeId}\n`);
    expect(repository.findNodeId()).toBe(nodeId);
  });

  test('does not overwrite an existing node ID', () => {
    expect(repository.createNodeId(nodeId)).toBe(true);
    expect(repository.createNodeId(otherNodeId)).toBe(false);
    expect(repository.findNodeId()).toBe(nodeId);
  });

  test('trims surrounding whitespace from a persisted node ID', () => {
    mkdirSync(dirname(nodeIdPath), { recursive: true });
    writeFileSync(nodeIdPath, `  ${nodeId}\n`, 'utf8');

    expect(repository.findNodeId()).toBe(nodeId);
  });

  test('throws a data-loss error when the persisted node ID is invalid', () => {
    mkdirSync(dirname(nodeIdPath), { recursive: true });
    writeFileSync(nodeIdPath, 'invalid-node-id\n', 'utf8');

    expect(() => repository.findNodeId()).toThrow(GenericDataLossError);
  });

  test('maps node ID read failures to an internal error', () => {
    const config: IdentityConfig = {
      nodeIdPath: rootPath
    };

    repository = new IdentityRepository(config);

    expect(() => repository.findNodeId()).toThrow(GenericInternalServerError);
  });

  test('maps node ID directory initialization failures to an internal error', () => {
    const blockedParentPath = join(rootPath, 'blocked');

    writeFileSync(blockedParentPath, 'not-a-directory', 'utf8');

    repository = new IdentityRepository({
      nodeIdPath: join(blockedParentPath, 'node-id')
    });

    expect(() => repository.createNodeId(nodeId)).toThrow(GenericInternalServerError);
  });

  test('maps node ID write failures to an internal error', () => {
    repository = new IdentityRepository({
      nodeIdPath: `${nodeIdPath}\0`
    });

    expect(() => repository.createNodeId(nodeId)).toThrow(GenericInternalServerError);
  });
});
