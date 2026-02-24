// Mock for @tauri-apps/plugin-opener
import { vi } from 'vitest';

export const openUrl = vi.fn(async () => undefined);
export const openPath = vi.fn(async () => undefined);
export const revealItemInDir = vi.fn(async () => undefined);
