import { z } from 'zod';

/* codecs */

export const jsonDateCodec = z.codec(z.iso.datetime(), z.date(), {
  decode: (value) => new Date(value),
  encode: (value) => value.toISOString()
});
