const path = require('path');
const logger = require('./logger');

const IS_WINDOWS = process.platform === 'win32';

/**
 * Validate that a requested path is within the sandbox root.
 * Returns the resolved path if valid, or null if rejected.
 */
function validatePath(requestedPath, sandboxRoot) {
  if (!sandboxRoot) {
    // No sandbox configured — allow any path
    return path.resolve(requestedPath);
  }

  const resolved = path.resolve(requestedPath);
  const root = path.resolve(sandboxRoot);

  // Reject UNC paths on Windows
  if (IS_WINDOWS && resolved.startsWith('\\\\')) {
    logger.warn(`Rejected UNC path: ${resolved}`);
    return null;
  }

  // Case-insensitive comparison on Windows
  const normalizedResolved = IS_WINDOWS ? resolved.toLowerCase() : resolved;
  const normalizedRoot = IS_WINDOWS ? root.toLowerCase() : root;

  if (!normalizedResolved.startsWith(normalizedRoot + path.sep) && normalizedResolved !== normalizedRoot) {
    logger.warn(`Path outside sandbox: ${resolved} (root: ${root})`);
    return null;
  }

  return resolved;
}

module.exports = { validatePath };
