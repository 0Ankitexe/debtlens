// Mock for @tauri-apps/api/core in test environment
import { vi } from 'vitest';

export const invoke = vi.fn(async (_cmd: string, _args?: Record<string, unknown>) => null);
export const convertFileSrc = vi.fn((path: string) => path);
