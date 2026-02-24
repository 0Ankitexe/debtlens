// Mock for @tauri-apps/plugin-dialog
import { vi } from 'vitest';

export const open = vi.fn(async () => null);
export const save = vi.fn(async () => null);
export const message = vi.fn(async () => undefined);
export const ask = vi.fn(async () => false);
export const confirm = vi.fn(async () => false);
