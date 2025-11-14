import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

interface TerminalProps {
  logs: string[];
  className?: string;
}

export default function Terminal({ logs, className = '' }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize terminal
    const terminal = new XTerm({
      theme: {
        background: '#000000',
        foreground: '#00ff00',
        cursor: '#00ff00',
      },
      fontSize: 12,
      fontFamily: 'JetBrains Mono, Fira Code, Monaco, Consolas, monospace',
      cursorBlink: false,
      disableStdin: true,
      rows: 10,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    
    terminal.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      terminal.dispose();
    };
  }, []);

  useEffect(() => {
    if (!xtermRef.current) return;

    // Clear terminal and write new logs
    xtermRef.current.clear();
    
    if (logs.length === 0) {
      xtermRef.current.writeln('🚀 Ready to compile...');
      return;
    }

    logs.forEach((log) => {
      if (log.includes('Error:') || log.includes('error')) {
        xtermRef.current?.writeln(`\x1b[31m${log}\x1b[0m`); // Red for errors
      } else if (log.includes('Warning:') || log.includes('warning')) {
        xtermRef.current?.writeln(`\x1b[33m${log}\x1b[0m`); // Yellow for warnings
      } else if (log.includes('✅') || log.includes('success')) {
        xtermRef.current?.writeln(`\x1b[32m${log}\x1b[0m`); // Green for success
      } else {
        xtermRef.current?.writeln(log);
      }
    });
  }, [logs]);

  return (
    <div className={`terminal-container ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-green-400">Compiler Output</h3>
        <div className="flex space-x-1">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
        </div>
      </div>
      <div ref={terminalRef} className="h-40" />
    </div>
  );
}
