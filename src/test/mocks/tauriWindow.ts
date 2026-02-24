// Mock for @tauri-apps/api/window
import { vi } from 'vitest';

const windowMock = {
    setTitle: vi.fn(async () => undefined),
    minimize: vi.fn(async () => undefined),
    maximize: vi.fn(async () => undefined),
    toggleMaximize: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    isMaximized: vi.fn(async () => false),
    listen: vi.fn(async () => () => { }),
};

export const getCurrentWindow = vi.fn(() => windowMock);
export const appWindow = windowMock;
