/* config */

const config = {
  clearMocks: true,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'typescript'
          },
          target: 'es2022'
        },
        module: {
          type: 'commonjs'
        }
      }
    ]
  }
};

/* exports */

export default config;
