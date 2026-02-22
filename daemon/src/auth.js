const crypto = require('crypto');
const { URL } = require('url');
const logger = require('./logger');

/**
 * Authenticate a WebSocket upgrade request.
 * Checks Authorization header first, then ?token= query param.
 * Uses timing-safe comparison to prevent timing attacks.
 */
function authenticate(req, expectedToken) {
  const tokenBuffer = Buffer.from(expectedToken, 'utf-8');

  // Check Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      const provided = Buffer.from(match[1], 'utf-8');
      if (provided.length === tokenBuffer.length && crypto.timingSafeEqual(provided, tokenBuffer)) {
        return true;
      }
    }
  }

  // Check ?token= query param (for React Native — no custom header support)
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const queryToken = url.searchParams.get('token');
    if (queryToken) {
      const provided = Buffer.from(queryToken, 'utf-8');
      if (provided.length === tokenBuffer.length && crypto.timingSafeEqual(provided, tokenBuffer)) {
        return true;
      }
    }
  } catch {
    // malformed URL, ignore
  }

  logger.warn(`Auth failed from ${req.socket.remoteAddress}`);
  return false;
}

module.exports = { authenticate };
