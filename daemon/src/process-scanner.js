const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('./logger');

const CACHE_TTL_MS = 5000;
let cachedResult = null;
let cachedAt = 0;

/**
 * Normalize a string the same way Claude Code encodes project paths:
 * every non-alphanumeric char becomes '-'.
 */
function normalizeForComparison(str) {
  return str.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Decode an encoded project directory name back to a real filesystem path.
 * E.g. "E--Dinko-Abdi--My-Apps-remote-claude" → "E:\Dinko Abdić\My Apps\remote-claude"
 *
 * Strategy: extract drive letter, then greedily walk the filesystem matching
 * normalized directory names against segments of the encoded string.
 */
function decodeProjectDir(encoded) {
  try {
    // Extract drive letter: first char should be a letter, followed by '-'
    const driveMatch = encoded.match(/^([A-Za-z])-(.+)$/);
    if (!driveMatch) return null;

    const driveLetter = driveMatch[1].toUpperCase();
    let remaining = driveMatch[2];
    let currentPath = driveLetter + ':\\';

    if (!fs.existsSync(currentPath)) return null;

    // Greedily walk filesystem: at each level, try to match the longest
    // directory name that matches the start of `remaining`
    while (remaining.length > 0) {
      // Strip leading '-' separators (the path separator gets encoded as '-')
      if (remaining.startsWith('-')) {
        remaining = remaining.slice(1);
        if (remaining.length === 0) break;
      }

      let entries;
      try {
        entries = fs.readdirSync(currentPath, { withFileTypes: true });
      } catch {
        return null; // can't read directory
      }

      const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);

      // Try longest match first (greedy)
      let matched = false;
      // Sort by normalized length descending for greedy matching
      const candidates = dirs
        .map(name => ({ name, normalized: normalizeForComparison(name) }))
        .sort((a, b) => b.normalized.length - a.normalized.length);

      for (const { name, normalized } of candidates) {
        if (remaining.startsWith(normalized)) {
          // Check that the match ends at the string boundary or at a '-' separator
          const afterMatch = remaining.slice(normalized.length);
          if (afterMatch.length === 0 || afterMatch.startsWith('-')) {
            currentPath = path.join(currentPath, name);
            remaining = afterMatch;
            matched = true;
            break;
          }
        }
      }

      if (!matched) return null; // no directory matched
    }

    // Verify the decoded path exists
    if (fs.existsSync(currentPath)) {
      return currentPath;
    }
    return null;
  } catch (err) {
    logger.debug?.(`Failed to decode project dir "${encoded}": ${err.message}`);
    return null;
  }
}

/**
 * Scan ~/.claude/projects/ for project directories, sorted by most recent activity.
 * No time cutoff — we match the N most recent projects to N detected processes.
 * Returns Map<encodedDirName, { cwd, projectName, lastModified }>
 */
function scanRecentProjects() {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');
  const all = [];

  if (!fs.existsSync(claudeDir)) return new Map();

  try {
    const projectDirs = fs.readdirSync(claudeDir, { withFileTypes: true });

    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;

      const projectPath = path.join(claudeDir, dir.name);
      let latestMtime = 0;

      try {
        const files = fs.readdirSync(projectPath);
        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue;
          try {
            const stat = fs.statSync(path.join(projectPath, file));
            if (stat.mtimeMs > latestMtime) {
              latestMtime = stat.mtimeMs;
            }
          } catch {
            // skip unreadable files
          }
        }
      } catch {
        continue;
      }

      if (latestMtime > 0) {
        all.push({
          dirName: dir.name,
          cwd: decodeProjectDir(dir.name),
          projectName: dir.name,
          lastModified: latestMtime,
        });
      }
    }
  } catch (err) {
    logger.warn?.(`Failed to scan Claude projects: ${err.message}`);
  }

  // Sort most recent first — callers pick the top N to match detected processes
  all.sort((a, b) => b.lastModified - a.lastModified);

  const results = new Map();
  for (const entry of all) {
    results.set(entry.dirName, entry);
  }
  return results;
}

// Persistent PID → project mapping (survives across scans so assignments stay stable)
const pidProjectMap = new Map(); // pid → { cwd, projectName }

/**
 * Scan for externally-running claude.exe processes (not managed by the daemon).
 * Uses a stable PID→project mapping: a project is assigned to a PID once when
 * it first appears and only freed when that PID disappears.
 * @param {number[]} daemonPtyPids - PIDs of daemon-managed PTY processes to exclude
 * @returns {Array<{pid: number, cwd: string|null, projectName: string}>}
 */
function scanExternalClaudeSessions(daemonPtyPids = []) {
  // Return cache if still fresh
  if (cachedResult && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedResult;
  }

  const results = [];
  const daemonPidSet = new Set(daemonPtyPids);

  try {
    // Find claude.exe processes via wmic
    const raw = execSync(
      'wmic process where "name=\'claude.exe\'" get ProcessId,ExecutablePath,ParentProcessId /FORMAT:CSV',
      { encoding: 'utf-8', timeout: 5000, windowsHide: true }
    );

    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    // CSV format: Node,ExecutablePath,ParentProcessId,ProcessId
    // Skip header
    const claudeProcesses = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',');
      if (parts.length < 4) continue;

      const exePath = parts[1];
      const parentPid = parseInt(parts[2], 10);
      const pid = parseInt(parts[3], 10);

      // Only include ~/.local/bin/claude.exe (not Claude Desktop/Electron)
      if (!exePath || !exePath.includes('.local') || !exePath.includes('bin')) continue;

      // Exclude daemon-managed processes
      if (daemonPidSet.has(parentPid)) continue;

      claudeProcesses.push({ pid, parentPid, exePath });
    }

    // Prune stale PIDs from the mapping (processes that no longer exist)
    const currentPids = new Set(claudeProcesses.map(p => p.pid));
    for (const pid of pidProjectMap.keys()) {
      if (!currentPids.has(pid)) pidProjectMap.delete(pid);
    }

    if (claudeProcesses.length === 0) {
      cachedResult = [];
      cachedAt = Date.now();
      return results;
    }

    // Find PIDs that don't have a project assigned yet
    const unmappedProcesses = claudeProcesses.filter(p => !pidProjectMap.has(p.pid));

    if (unmappedProcesses.length > 0) {
      // Scan projects and find ones not already assigned to existing PIDs
      const recentProjects = scanRecentProjects();
      const projectList = [...recentProjects.values()]
        .sort((a, b) => b.lastModified - a.lastModified);

      const assignedProjects = new Set(
        [...pidProjectMap.values()].map(v => v.projectName)
      );
      const availableProjects = projectList.filter(
        p => !assignedProjects.has(p.projectName)
      );

      // Assign the most recent available project to each new PID
      for (let i = 0; i < unmappedProcesses.length; i++) {
        const project = availableProjects[i] || null;
        pidProjectMap.set(unmappedProcesses[i].pid, {
          cwd: project?.cwd || null,
          projectName: project?.projectName || 'Unknown project',
        });
      }
    }

    // Build results from the stable mapping
    for (const proc of claudeProcesses) {
      const mapping = pidProjectMap.get(proc.pid);
      results.push({
        pid: proc.pid,
        cwd: mapping?.cwd || null,
        projectName: mapping?.projectName || 'Unknown project',
      });
    }
  } catch (err) {
    // wmic may fail if no claude.exe is running — that's fine
    if (!err.message?.includes('No Instance')) {
      logger.warn?.(`Process scan failed: ${err.message}`);
    }
  }

  cachedResult = results;
  cachedAt = Date.now();
  return results;
}

module.exports = { scanExternalClaudeSessions, decodeProjectDir };
