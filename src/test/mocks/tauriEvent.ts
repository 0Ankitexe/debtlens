// Mock for @tauri-apps/api/event
import { vi } from 'vitest';

export const listen = vi.fn(async () => () => { });
export const once = vi.fn(async () => () => { });
export const emit = vi.fn(async () => undefined);
