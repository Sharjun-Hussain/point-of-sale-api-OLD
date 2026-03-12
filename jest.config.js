module.exports = {
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    clearMocks: true,
    restoreMocks: true,
    coverageDirectory: 'coverage',
    testMatch: ['**/tests/**/*.test.js'],
    verbose: true,
    // Run tests sequentially to avoid database lock and state issues
    maxWorkers: 1,
};
