import { z } from 'zod';

/* codecs */

export const jsonBigIntCodec = z.codec(z.string().regex(/^\d+$/), z.bigint(), {
  decode: (value) => BigInt(value),
  encode: (value) => value.toString()
});
