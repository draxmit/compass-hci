import * as Device from 'expo-device';
import { PixelRatio, Platform } from 'react-native';
import { create } from 'zustand';

type UiState = {
  lowEndMode: boolean;
  setLowEndMode: (v: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  lowEndMode: false,
  setLowEndMode: (v) => set({ lowEndMode: v }),
}));

/**
 * Detect low-end devices to disable expensive effects (BlurView, animated aurora).
 * Web is never low-end here — backdrop-filter has its own perf characteristics.
 *
 * Edge: `Device.totalMemory` can be null on iOS sandbox. Default to MAX so we
 * assume high-end (favor visual fidelity); the worst case is a slight stutter.
 */
export async function detectLowEndMode(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const totalMemory = Device.totalMemory ?? Number.MAX_SAFE_INTEGER;
  const memGB = totalMemory / (1024 * 1024 * 1024);
  const dpr = PixelRatio.get();
  return memGB < 3 || dpr < 2;
}
