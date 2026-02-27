export interface DaemonSession {
  id: string;
  cwd: string;
  name: string;
  createdAt: string;
  hasClient: boolean;
}

export async function fetchSessions(
  host: string,
  port: number,
  token: string
): Promise<DaemonSession[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `http://${host}:${port}/api/sessions`,
      { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } }
    );
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.sessions || [];
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export interface ExternalSession {
  pid: number;
  cwd: string | null;
  projectName: string;
}

export async function fetchExternalSessions(
  host: string,
  port: number,
  token: string
): Promise<ExternalSession[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `http://${host}:${port}/api/external-sessions`,
      { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } }
    );
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.sessions || [];
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export async function deleteSession(
  host: string,
  port: number,
  token: string,
  sessionId: string
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `http://${host}:${port}/api/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'DELETE', signal: controller.signal, headers: { Authorization: `Bearer ${token}` } }
    );
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}
