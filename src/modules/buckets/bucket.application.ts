import { Bucket } from './bucket.domain';

export type EnsureBucketResult = {
  bucket: Bucket;
  created: boolean;
};
