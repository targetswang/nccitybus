export * from './api-types';
export declare const API_VERSION: 'v1';
export declare const CATEGORIES: readonly string[];
export type IntegrationState = 'not_configured' | 'connecting' | 'connected' | 'error' | 'stopped';
export type Freshness = 'no_data' | 'fresh' | 'stale' | 'unavailable';
export declare class DomainError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status?: number);
}
export declare function invariant(condition: unknown, code: string, message: string, status?: number): asserts condition;
export declare function object(value: unknown, label?: string): Record<string, unknown>;
export declare function text(value: unknown, label: string, max?: number): string;
export declare function identifier(value: unknown, label?: string): string;
export declare function integer(value: unknown, label: string, min?: number, max?: number): number;
export declare function coordinate(lat: number, lng: number, crs: 'WGS84'|'GCJ02'): import('./api-types').GeoPoint;
export declare function safeTime(value: number, now: number, futureMs?: number): number;
export declare function validateCatalog(value: unknown): import('./api-types').ContentSnapshot;
export declare function validateRoute(value: unknown): import('./api-types').TransitRoute;
