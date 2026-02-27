import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { asyncStorage } from './mmkvStorage';

export interface SessionInfo {
  id: string;
  cwd: string;
  name: string;
  createdAt: string;
  lastConnectedAt: string;
  hasClient?: boolean;
}

interface SessionState {
  sessions: SessionInfo[];
  activeSessionId: string | null;
  addSession: (session: SessionInfo) => void;
  removeSession: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  syncWithDaemon: (daemonSessions: { id: string; cwd: string; name: string; createdAt: string; hasClient: boolean }[]) => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeSessionId: null,

      addSession: (session) =>
        set((state) => {
          const exists = state.sessions.find((s) => s.id === session.id);
          if (exists) {
            return {
              sessions: state.sessions.map((s) =>
                s.id === session.id ? { ...s, lastConnectedAt: new Date().toISOString() } : s
              ),
            };
          }
          return { sessions: [...state.sessions, session] };
        }),

      removeSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          activeSessionId: state.activeSessionId === id ? null : state.activeSessionId,
        })),

      setActiveSession: (id) => set({ activeSessionId: id }),

      syncWithDaemon: (daemonSessions) =>
        set((state) => {
          const daemonMap = new Map(daemonSessions.map((s) => [s.id, s]));
          // Remove local sessions that no longer exist on daemon, update hasClient
          const kept = state.sessions
            .filter((s) => daemonMap.has(s.id))
            .map((s) => {
              const ds = daemonMap.get(s.id)!;
              return { ...s, hasClient: ds.hasClient, name: ds.name || s.name, cwd: ds.cwd || s.cwd };
            });
          // Add daemon sessions not in local store
          const localIds = new Set(kept.map((s) => s.id));
          const added = daemonSessions
            .filter((s) => !localIds.has(s.id))
            .map((s) => ({
              id: s.id,
              cwd: s.cwd,
              name: s.name,
              createdAt: s.createdAt,
              lastConnectedAt: s.createdAt,
              hasClient: s.hasClient,
            }));
          return {
            sessions: [...kept, ...added],
            activeSessionId: state.activeSessionId && daemonMap.has(state.activeSessionId)
              ? state.activeSessionId
              : null,
          };
        }),
    }),
    {
      name: 'session-store',
      storage: createJSONStorage(() => asyncStorage),
    }
  )
);
