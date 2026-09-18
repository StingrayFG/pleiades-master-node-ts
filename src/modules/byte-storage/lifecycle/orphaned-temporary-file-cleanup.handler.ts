import type { ByteStorageConfig } from '../byte-storage.config';
import type { DiskByteStorageServiceContract } from '../disk-byte-storage.service';

/* handler */

class OrphanedTemporaryFileCleanupHandler {
  constructor(
    private readonly diskService: DiskByteStorageServiceContract,
    private readonly byteStorageConfig: ByteStorageConfig
  ) {}

  async run(now: Date): Promise<void> {
    const olderThan = new Date(now.getTime() - this.byteStorageConfig.lifecycle.temporaryFileCleanup.afterMs);

    await this.diskService.deleteTemporaryFiles(olderThan);
  }
}

/* exports */

export { OrphanedTemporaryFileCleanupHandler };
