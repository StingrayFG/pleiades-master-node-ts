/* predicates */

export const hasFileSystemErrorCode = (err: unknown, code: string): err is NodeJS.ErrnoException => {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === code;
};
