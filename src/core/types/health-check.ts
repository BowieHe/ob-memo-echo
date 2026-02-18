/**
 * Health Check Types
 * Unified interface for service connection checking
 */

export interface HealthCheckResult {
    connected: boolean;
    message: string;
    detail?: string;
}

export interface HealthCheckable {
    checkConnection(): Promise<HealthCheckResult>;
}
