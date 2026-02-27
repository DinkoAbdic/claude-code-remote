import { create } from 'zustand';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface TerminalState {
  sessionId: string | null;
  connectionStatus: ConnectionStatus;
  hadSession: boolean;
  cols: number;
  rows: number;
  setSessionId: (id: string | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setHadSession: (had: boolean) => void;
  setDimensions: (cols: number, rows: number) => void;
}

export const useTerminalStore = create<TerminalState>()((set) => ({
  sessionId: null,
  connectionStatus: 'disconnected',
  hadSession: false,
  cols: 80,
  rows: 24,
  setSessionId: (sessionId) => set({ sessionId }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setHadSession: (hadSession) => set({ hadSession }),
  setDimensions: (cols, rows) => set({ cols, rows }),
}));
