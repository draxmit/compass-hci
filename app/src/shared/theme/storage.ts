import { MMKV } from 'react-native-mmkv';

const mmkv = new MMKV({ id: 'compass-theme' });

export const themeStorage = {
  getString: (key: string): string | null => mmkv.getString(key) ?? null,
  setString: (key: string, value: string): void => {
    mmkv.set(key, value);
  },
};
