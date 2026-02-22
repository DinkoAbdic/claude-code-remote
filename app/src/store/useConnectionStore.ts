import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { asyncStorage } from './mmkvStorage';

interface ConnectionState {
  host: string;
  port: number;
  token: string;
  setHost: (host: string) => void;
  setPort: (port: number) => void;
  setToken: (token: string) => void;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      host: '',
      port: 8485,
      token: '',
      setHost: (host) => set({ host }),
      setPort: (port) => set({ port }),
      setToken: (token) => set({ token }),
    }),
    {
      name: 'connection-store',
      storage: createJSONStorage(() => asyncStorage),
    }
  )
);
