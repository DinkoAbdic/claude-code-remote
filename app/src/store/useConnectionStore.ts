import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { asyncStorage } from './mmkvStorage';

export interface Bookmark {
  name: string;
  path: string;
}

interface ConnectionState {
  host: string;
  port: number;
  token: string;
  startingDirectory: string;
  fontSize: number;
  bookmarks: Bookmark[];
  geminiApiKey: string;
  autoLaunchClaude: boolean;
  setHost: (host: string) => void;
  setPort: (port: number) => void;
  setToken: (token: string) => void;
  setStartingDirectory: (dir: string) => void;
  setFontSize: (size: number) => void;
  addBookmark: (bookmark: Bookmark) => void;
  removeBookmark: (path: string) => void;
  setGeminiApiKey: (key: string) => void;
  setAutoLaunchClaude: (enabled: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      host: '',
      port: 8485,
      token: '',
      startingDirectory: '',
      fontSize: 14,
      bookmarks: [],
      geminiApiKey: '',
      autoLaunchClaude: true,
      setHost: (host) => set({ host }),
      setPort: (port) => set({ port }),
      setToken: (token) => set({ token }),
      setStartingDirectory: (startingDirectory) => set({ startingDirectory }),
      setFontSize: (fontSize) => set({ fontSize: Math.min(24, Math.max(8, fontSize)) }),
      addBookmark: (bookmark) => set((state) => ({
        bookmarks: state.bookmarks.some((b) => b.path === bookmark.path)
          ? state.bookmarks
          : [...state.bookmarks, bookmark],
      })),
      removeBookmark: (path) => set((state) => ({
        bookmarks: state.bookmarks.filter((b) => b.path !== path),
      })),
      setGeminiApiKey: (geminiApiKey) => set({ geminiApiKey }),
      setAutoLaunchClaude: (autoLaunchClaude) => set({ autoLaunchClaude }),
    }),
    {
      name: 'connection-store',
      storage: createJSONStorage(() => asyncStorage),
    }
  )
);
