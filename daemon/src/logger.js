const PREFIX = '[claude-remote]';

const logger = {
  info: (...args) => console.log(PREFIX, new Date().toISOString(), ...args),
  warn: (...args) => console.warn(PREFIX, new Date().toISOString(), ...args),
  error: (...args) => console.error(PREFIX, new Date().toISOString(), ...args),
};

module.exports = logger;
