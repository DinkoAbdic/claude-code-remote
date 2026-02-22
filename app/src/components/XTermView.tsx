import React, { useRef, useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

interface XTermViewProps {
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
}

export interface XTermViewRef {
  write: (data: string) => void;
  focus: () => void;
}

const XTERM_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #1e1e1e; }
    #terminal { width: 100%; height: 100%; }
    .xterm { height: 100%; }
  </style>
</head>
<body>
  <div id="terminal"></div>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.11.0/lib/addon-web-links.min.js"></script>
  <script>
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Fira Code', 'Cascadia Code', 'JetBrains Mono', 'Courier New', monospace",
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78',
        black: '#1e1e1e',
        red: '#f44747',
        green: '#6a9955',
        yellow: '#d7ba7d',
        blue: '#569cd6',
        magenta: '#c586c0',
        cyan: '#4ec9b0',
        white: '#d4d4d4',
        brightBlack: '#808080',
        brightRed: '#f44747',
        brightGreen: '#6a9955',
        brightYellow: '#d7ba7d',
        brightBlue: '#569cd6',
        brightMagenta: '#c586c0',
        brightCyan: '#4ec9b0',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon.FitAddon();
    const webLinksAddon = new WebLinksAddon.WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(document.getElementById('terminal'));

    fitAddon.fit();

    function sendDimensions() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'resize',
        cols: term.cols,
        rows: term.rows,
      }));
    }

    term.onData(function(data) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'input',
        data: data,
      }));
    });

    var resizeObserver = new ResizeObserver(function() {
      fitAddon.fit();
      sendDimensions();
    });
    resizeObserver.observe(document.getElementById('terminal'));

    setTimeout(function() {
      fitAddon.fit();
      sendDimensions();
    }, 100);

    window.addEventListener('message', function(event) {
      handleMessage(event.data);
    });
    document.addEventListener('message', function(event) {
      handleMessage(event.data);
    });

    function handleMessage(raw) {
      try {
        var msg = JSON.parse(raw);
        switch (msg.type) {
          case 'output':
            term.write(msg.data);
            break;
          case 'focus':
            term.focus();
            break;
          case 'blur':
            term.blur();
            break;
        }
      } catch (e) {
        console.error('Failed to parse message from RN:', e);
      }
    }
  </script>
</body>
</html>`;

export const XTermView = React.forwardRef<XTermViewRef, XTermViewProps>(
  ({ onInput, onResize }, ref) => {
    const webViewRef = useRef<WebView>(null);

    React.useImperativeHandle(ref, () => ({
      write: (data: string) => {
        const msg = JSON.stringify({ type: 'output', data });
        webViewRef.current?.postMessage(msg);
      },
      focus: () => {
        webViewRef.current?.postMessage(JSON.stringify({ type: 'focus' }));
      },
    }));

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        try {
          const msg = JSON.parse(event.nativeEvent.data);
          switch (msg.type) {
            case 'input':
              onInput(msg.data);
              break;
            case 'resize':
              onResize(msg.cols, msg.rows);
              break;
          }
        } catch {
          console.warn('Failed to parse xterm message');
        }
      },
      [onInput, onResize]
    );

    return (
      <WebView
        ref={webViewRef}
        source={{ html: XTERM_HTML }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={['*']}
        onMessage={handleMessage}
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
