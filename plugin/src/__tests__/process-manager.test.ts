/**
 * Unit tests for ProcessManager
 */

import { ProcessManager } from '../process-manager';
import { RustApiClient } from '../api-client';
import { ChildProcess } from 'child_process';

// Mock child_process
jest.mock('child_process');
const { spawn } = require('child_process');

describe('ProcessManager', () => {
    let processManager: ProcessManager;
    let mockApiClient: jest.Mocked<RustApiClient>;
    let mockProcess: Partial<ChildProcess>;

    beforeEach(() => {
        // Create mock API client
        mockApiClient = {
            isAvailable: jest.fn(),
            health: jest.fn(),
            search: jest.fn(),
            index: jest.fn(),
        } as any;

        // Create mock process
        mockProcess = {
            kill: jest.fn(),
            killed: false,
            on: jest.fn(),
        };

        spawn.mockReturnValue(mockProcess);

        processManager = new ProcessManager(mockApiClient, {
            binaryPath: '/mock/path/to/binary',
            maxRetries: 3,
            retryDelayMs: 100,
            healthCheckIntervalMs: 100,
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('start()', () => {
        it('should return true if service is already running', async () => {
            mockApiClient.isAvailable.mockResolvedValue(true);

            const result = await processManager.start();

            expect(result).toBe(true);
            expect(spawn).not.toHaveBeenCalled();
            expect(processManager.getRetryCount()).toBe(0);
        });

        it('should start process and wait for service', async () => {
            mockApiClient.isAvailable
                .mockResolvedValueOnce(false) // Initial check
                .mockResolvedValueOnce(false) // First health check
                .mockResolvedValueOnce(true);  // Service available

            const result = await processManager.start();

            expect(result).toBe(true);
            expect(spawn).toHaveBeenCalledWith('/mock/path/to/binary', [], expect.any(Object));
            expect(processManager.getRetryCount()).toBe(0);
        });

        it('should retry up to maxRetries times on failure', async () => {
            mockApiClient.isAvailable.mockResolvedValue(false);

            const result = await processManager.start();

            expect(result).toBe(false);
            expect(processManager.getRetryCount()).toBe(3);
            expect(spawn).toHaveBeenCalledTimes(3);
        }, 15000);

        it('should succeed on second retry', async () => {
            mockApiClient.isAvailable
                .mockResolvedValueOnce(false) // Initial check - retry 1
                .mockResolvedValueOnce(false) // Health check fails
                .mockResolvedValueOnce(false) // Initial check - retry 2
                .mockResolvedValueOnce(true);  // Health check succeeds

            const result = await processManager.start();

            expect(result).toBe(true);
            // Retry count is 0 because we succeeded on the second attempt
            expect(processManager.getRetryCount()).toBe(0);
        });

        it('should not start if already starting', async () => {
            mockApiClient.isAvailable.mockImplementation(() =>
                new Promise(resolve => setTimeout(() => resolve(false), 200))
            );

            const promise1 = processManager.start();
            const promise2 = processManager.start();

            const result2 = await promise2;
            expect(result2).toBe(false);

            // Cancel the first promise by resolving it
            await promise1;
        }, 10000);
    });

    describe('stop()', () => {
        it('should kill the process if running', async () => {
            mockApiClient.isAvailable
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);

            await processManager.start();
            await processManager.stop();

            expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
        });

        it('should do nothing if process is not running', async () => {
            await processManager.stop();

            expect(mockProcess.kill).not.toHaveBeenCalled();
        });
    });

    describe('isRunning()', () => {
        it('should return false initially', () => {
            expect(processManager.isRunning()).toBe(false);
        });

        it('should return true after starting process', async () => {
            mockApiClient.isAvailable
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);

            await processManager.start();

            expect(processManager.isRunning()).toBe(true);
        });

        it('should return false after stopping', async () => {
            mockApiClient.isAvailable
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);

            await processManager.start();
            await processManager.stop();

            expect(processManager.isRunning()).toBe(false);
        });
    });

    describe('retry logic', () => {
        it('should track retry count correctly', async () => {
            mockApiClient.isAvailable.mockResolvedValue(false);

            const result = await processManager.start();

            expect(result).toBe(false);
            expect(processManager.getRetryCount()).toBe(3);
        }, 15000);

        it('should reset retry count', async () => {
            mockApiClient.isAvailable.mockResolvedValue(false);

            const result = await processManager.start();
            expect(result).toBe(false);
            expect(processManager.getRetryCount()).toBe(3);

            processManager.resetRetryCount();
            expect(processManager.getRetryCount()).toBe(0);
        }, 15000);
    });

    describe('configuration', () => {
        it('should use default config if not provided', () => {
            const defaultManager = new ProcessManager(mockApiClient);

            expect(defaultManager).toBeDefined();
        });

        it('should use custom config', () => {
            const customManager = new ProcessManager(mockApiClient, {
                binaryPath: '/custom/path',
                maxRetries: 5,
                retryDelayMs: 500,
                healthCheckIntervalMs: 200,
            });

            expect(customManager).toBeDefined();
        });
    });
});
