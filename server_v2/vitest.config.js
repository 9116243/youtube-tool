"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var config_1 = require("vitest/config");
exports.default = (0, config_1.defineConfig)({
    test: {
        setupFiles: ['./vitest.setup.ts'],
        environment: 'node',
        pool: 'threads',
        maxThreads: 1,
        minThreads: 1,
        coverage: {
            reporter: ['text', 'lcov'],
            reportsDirectory: './coverage'
        }
    }
});
