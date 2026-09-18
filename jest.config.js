module.exports = {
    preset: 'ts-jest',
    reporters: [
        'default',
        [
            'jest-junit',
            {
                outputDirectory: 'test-results/jest',
                addFileAttribute: 'true',
                suiteNameTemplate: '{filepath}'
            }
        ]
    ],
    testEnvironment: 'node',
    testTimeout: 60000
};
