import React, { useRef, useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

const DEBUG_XTERM_BRIDGE = false;

function debugBridge(...args: unknown[]) {
  if (!DEBUG_XTERM_BRIDGE) return;
  console.log('[xterm-bridge]', ...args);
}

interface XTermViewProps {
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  onSelection?: (text: string) => void;
  fontSize?: number;
}

export interface XTermViewRef {
  write: (data: string) => void;
  focus: () => void;
  setFontSize: (size: number) => void;
  reset: () => void;
  getSelection: () => void;
  paste: (text: string) => void;
}

function buildXTermHTML(initialFontSize: number) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #1e1e1e; }
    #terminal { width: 100%; height: 100%; padding: 0 4px; }
    .xterm { height: 100%; }
  </style>
</head>
<body>
  <div id="terminal"></div>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js" onerror="window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'bootstrapError', stage: 'load-xterm' }))"></script>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js" onerror="window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'bootstrapError', stage: 'load-fit-addon' }))"></script>
  <script>
    function postBootstrapError(stage, error) {
      var message = error && (error.message || String(error));
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'bootstrapError',
        stage: stage,
        message: message || null,
      }));
    }

    try {
      var terminalEl = document.getElementById('terminal');
      var fallbackBuffer = '';
      var term = null;

      function createFallbackTerminal() {
        terminalEl.style.overflow = 'auto';
        terminalEl.style.whiteSpace = 'pre-wrap';
        terminalEl.style.wordBreak = 'break-word';
        terminalEl.style.color = '#d4d4d4';
        terminalEl.style.fontFamily = "'Cascadia Mono', 'Consolas', monospace";
        terminalEl.style.fontSize = '${initialFontSize}px';
        terminalEl.style.lineHeight = '1.35';

        return {
          cols: 80,
          rows: 24,
          options: { fontSize: ${initialFontSize} },
          write: function(data) {
            fallbackBuffer += data;
            if (fallbackBuffer.length > 200000) {
              fallbackBuffer = fallbackBuffer.slice(-200000);
            }
            terminalEl.textContent = fallbackBuffer;
            terminalEl.scrollTop = terminalEl.scrollHeight;
          },
          focus: function() {},
          blur: function() {},
          reset: function() {
            fallbackBuffer = '';
            terminalEl.textContent = '';
          },
          getSelection: function() {
            if (window.getSelection) return String(window.getSelection() || '');
            return '';
          },
          paste: function(text) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'input', data: text }));
          },
        };
      }

      var fitAddon = null;

      if (window.Terminal) {
        term = new Terminal({
          cursorBlink: true,
          fontSize: ${initialFontSize},
          fontFamily: "'JetBrains Mono', 'Cascadia Mono', 'Consolas', 'Courier New', monospace",
          theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#d4d4d4',
            selectionBackground: '#264f78',
          },
          allowProposedApi: true,
        });
        if (window.FitAddon && window.FitAddon.FitAddon) {
          fitAddon = new FitAddon.FitAddon();
          term.loadAddon(fitAddon);
        }
        term.open(terminalEl);
        if (fitAddon) {
          try { fitAddon.fit(); } catch (_) {}
        }
      } else {
        postBootstrapError('missing-xterm-globals');
        term = createFallbackTerminal();
      }

      function sendDimensions() {
        if (fitAddon) {
          try { fitAddon.fit(); } catch (_) {}
        }
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows,
        }));
      }

      // --- Input batching to reduce RN bridge + WebSocket overhead ---
      var inputBuf = '';
      var inputTimer = null;
      function flushInput() {
        if (inputBuf) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'input', data: inputBuf }));
          inputBuf = '';
        }
        if (inputTimer) {
          clearTimeout(inputTimer);
          inputTimer = null;
        }
      }

      if (term.onData) {
        term.onData(function(data) {
          var code = data.charCodeAt(0);
          if (code < 32 || code === 127 || (data.length > 1 && code === 27)) {
            flushInput();
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'input', data: data }));
            return;
          }
          inputBuf += data;
          if (!inputTimer) inputTimer = setTimeout(flushInput, 16);
        });
      }

      if (typeof ResizeObserver === 'function') {
        var resizeObserver = new ResizeObserver(function() {
          sendDimensions();
        });
        resizeObserver.observe(terminalEl);
      } else {
        window.addEventListener('resize', function() {
          sendDimensions();
        });
      }
      setTimeout(function() {
        sendDimensions();
      }, 100);

      // On some Android WebViews both listeners may fire for the same RN→WebView message.
      var lastInboundRaw = null;
      var lastInboundAt = 0;
      function onMsg(event) {
        var raw = event && event.data;
        if (typeof raw !== 'string') {
          try { raw = JSON.stringify(raw); } catch (_) { return; }
        }
        if (!raw) return;
        var now = Date.now();
        if (raw === lastInboundRaw && (now - lastInboundAt) < 10) return;
        lastInboundRaw = raw;
        lastInboundAt = now;
        handleMessage(raw);
      }
      window.addEventListener('message', onMsg);
      document.addEventListener('message', onMsg);

      // Signal RN that terminal listeners are active.
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));

      function handleMessage(raw) {
        try {
          var msg = JSON.parse(raw);
          switch (msg.type) {
            case 'output':
              term.write(msg.data);
              break;
            case 'focus':
              if (term.focus) term.focus();
              break;
            case 'blur':
              if (term.blur) term.blur();
              break;
            case 'setFontSize':
              if (term.options) term.options.fontSize = msg.fontSize;
              if (!window.Terminal) terminalEl.style.fontSize = msg.fontSize + 'px';
              setTimeout(sendDimensions, 50);
              break;
            case 'reset':
              term.reset();
              break;
            case 'getSelection':
              var sel = term.getSelection ? term.getSelection() : '';
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'selection', text: sel || '' }));
              break;
            case 'paste':
              if (term.paste) term.paste(msg.text);
              break;
          }
        } catch (e) {
          console.error('Failed to parse message from RN:', e);
        }
      }
    } catch (e) {
      postBootstrapError('runtime-init', e);
    }
  </script>
</body>
</html>`;
}

export const XTermView = React.forwardRef<XTermViewRef, XTermViewProps>(
  ({ onInput, onResize, onSelection, fontSize = 14 }, ref) => {
    const [webViewKey, setWebViewKey] = useState(0);
    const webViewRef = useRef<WebView>(null);
    const readyRef = useRef(false);
    const queueRef = useRef<string[]>([]);

    const html = useMemo(() => buildXTermHTML(fontSize), [fontSize]);

    const flushQueuedWrites = useCallback(() => {
      if (!readyRef.current || queueRef.current.length === 0) return;
      debugBridge('flushing queued writes', { count: queueRef.current.length });
      for (const queued of queueRef.current) {
        webViewRef.current?.postMessage(queued);
      }
      queueRef.current = [];
    }, []);

    React.useImperativeHandle(ref, () => ({
      write: (data: string) => {
        const msg = JSON.stringify({ type: 'output', data });
        if (!readyRef.current) {
          debugBridge('queueing output before ready', {
            bytes: data.length,
            queueSizeBefore: queueRef.current.length,
          });
          queueRef.current.push(msg);
          return;
        }
        debugBridge('sending output immediately', { bytes: data.length });
        webViewRef.current?.postMessage(msg);
      },
      focus: () => {
        webViewRef.current?.postMessage(JSON.stringify({ type: 'focus' }));
      },
      setFontSize: (size: number) => {
        webViewRef.current?.postMessage(JSON.stringify({ type: 'setFontSize', fontSize: size }));
      },
      reset: () => {
        webViewRef.current?.postMessage(JSON.stringify({ type: 'reset' }));
      },
      getSelection: () => {
        webViewRef.current?.postMessage(JSON.stringify({ type: 'getSelection' }));
      },
      paste: (text: string) => {
        webViewRef.current?.postMessage(JSON.stringify({ type: 'paste', text }));
      },
    }));

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        try {
          const msg = JSON.parse(event.nativeEvent.data);
          switch (msg.type) {
            case 'ready':
              readyRef.current = true;
              debugBridge('received ready from WebView');
              flushQueuedWrites();
              break;
            case 'input':
              onInput(msg.data);
              break;
            case 'resize':
              // Fallback: if a rare bridge race drops "ready", resize proves
              // xterm is alive and can receive output.
              if (!readyRef.current) {
                readyRef.current = true;
                debugBridge('using resize as readiness fallback', {
                  cols: msg.cols,
                  rows: msg.rows,
                });
                flushQueuedWrites();
              }
              onResize(msg.cols, msg.rows);
              break;
            case 'selection':
              onSelection?.(msg.text);
              break;
            case 'bootstrapError':
              console.warn('xterm bootstrap error', msg.stage, msg.message || '');
              break;
          }
        } catch {
          console.warn('Failed to parse xterm message');
        }
      },
      [flushQueuedWrites, onInput, onResize, onSelection]
    );

    const handleLoadStart = useCallback(() => {
      // WebView is reloading; force handshake again.
      readyRef.current = false;
      debugBridge('WebView load start; waiting for ready handshake');
    }, []);

    const handleWebViewError = useCallback((event: any) => {
      const desc = event?.nativeEvent?.description;
      const code = event?.nativeEvent?.code;
      console.warn('xterm WebView load error', { code, description: desc });
    }, []);

    const handleWebViewHttpError = useCallback((event: any) => {
      const statusCode = event?.nativeEvent?.statusCode;
      const desc = event?.nativeEvent?.description;
      console.warn('xterm WebView HTTP error', { statusCode, description: desc });
    }, []);

    const handleRenderProcessGone = useCallback((event: any) => {
      const didCrash = event?.nativeEvent?.didCrash;
      console.warn('xterm WebView render process gone', { didCrash });
      readyRef.current = false;
      setWebViewKey((prev) => prev + 1);
    }, []);

    return (
      <WebView
        key={webViewKey}
        ref={webViewRef}
        source={{ html }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        onMessage={handleMessage}
        onLoadStart={handleLoadStart}
        onError={handleWebViewError}
        onHttpError={handleWebViewHttpError}
        onRenderProcessGone={handleRenderProcessGone}
        scrollEnabled={false}
        overScrollMode="never"
        textZoom={100}
      />
    );
  }
);

const styles = StyleSheet.create({
  webview: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
});
