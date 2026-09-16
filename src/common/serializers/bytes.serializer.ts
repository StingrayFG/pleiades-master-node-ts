import { Buffer } from 'node:buffer';
import { z } from 'zod';

/* codecs */

export const jsonBytesCodec = z.codec(z.string().base64(), z.instanceof(Buffer), {
  decode: (value) => Buffer.from(value, 'base64'),
  encode: (value) => value.toString('base64')
});
