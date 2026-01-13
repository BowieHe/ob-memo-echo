/**
 * Process Manager for Rust backend service
 * Handles auto-start, retry logic, and lifecycle management
 */

import { spawn, ChildProcess } from 'child_process';
import { RustApiClient } from './api-client';

export interface ProcessManagerConfig {
    binaryPath: string;
    maxRetries: number;
    retryDelayMs: number;
    healthCheckIntervalMs: number;
}

export class ProcessManager {
    private process: ChildProcess | null = null;
    private apiClient: RustApiClient;
    private config: ProcessManagerConfig;
    private retryCount: number = 0;
    private isStarting: boolean = false;

    constructor(apiClient: RustApiClient, config?: Partial<ProcessManagerConfig>) {
        this.apiClient = apiClient;
        this.config = {
            binaryPath: config?.binaryPath || '../core/target/release/ob-image-vector-rs',
            maxRetries: config?.maxRetries || 3,
            retryDelayMs: config?.retryDelayMs || 2000,
            healthCheckIntervalMs: config?.healthCheckIntervalMs || 1000,
        };
    }

    /**
     * Start the Rust process with retry logic
     */
    async start(): Promise<boolean> {
        if (this.isStarting) {
            return false;
        }

        this.isStarting = true;
        this.retryCount = 0;

        for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
            try {
                // Check if service is already running
                const isAvailable = await this.apiClient.isAvailable();
                if (isAvailable) {
                    this.isStarting = false;
                    return true;
                }

                // Try to start the process
                await this.startProcess();

                // Wait and check if service is available
                await this.waitForService();

                this.isStarting = false;
                return true;
            } catch (error) {
                this.retryCount = attempt + 1;
                console.error(`Failed to start Rust service (attempt ${this.retryCount}/${this.config.maxRetries}):`, error);

                if (attempt < this.config.maxRetries - 1) {
                    await this.delay(this.config.retryDelayMs);
                }
            }
        }

        this.isStarting = false;
        return false;
    }

    /**
     * Start the Rust process
     */
    private async startProcess(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this.process = spawn(this.config.binaryPath, [], {
                    detached: false,
                    stdio: 'pipe',
                });

                this.process.on('error', (error) => {
                    reject(new Error(`Failed to spawn process: ${error.message}`));
                });

                this.process.on('exit', (code) => {
                    console.log(`Rust process exited with code ${code}`);
                    this.process = null;
                });

                // Give process a moment to start
                setTimeout(() => resolve(), 500);
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Wait for service to become available
     */
    private async waitForService(): Promise<void> {
        const maxWaitTime = 2000; // 2 seconds (reduced for testing)
        const startTime = Date.now();

        while (Date.now() - startTime < maxWaitTime) {
            const isAvailable = await this.apiClient.isAvailable();
            if (isAvailable) {
                return;
            }
            await this.delay(this.config.healthCheckIntervalMs);
        }

        throw new Error('Service did not become available within timeout');
    }

    /**
     * Stop the Rust process
     */
    async stop(): Promise<void> {
        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }
    }

    /**
     * Check if process is running
     */
    isRunning(): boolean {
        return this.process !== null && !this.process.killed;
    }

    /**
     * Get current retry count
     */
    getRetryCount(): number {
        return this.retryCount;
    }

    /**
     * Reset retry count
     */
    resetRetryCount(): void {
        this.retryCount = 0;
    }

    /**
     * Utility: delay
     */
    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
