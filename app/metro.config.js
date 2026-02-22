const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Allow .html files to be loaded as assets (for xterm.js WebView)
config.resolver.assetExts.push('html');

module.exports = config;
