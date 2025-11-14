import { useState, useCallback } from 'react'
import { Play, Code, Terminal as TerminalIcon, Github, Zap } from 'lucide-react'
import CodeEditor from './components/CodeEditor'
import Terminal from './components/Terminal'

const defaultCode = `function ExpensiveComponent({ items, multiplier }) {
  const [count, setCount] = useState(0);
  const [filter, setFilter] = useState('');
  
  // This will be detected as expensive computation
  const processedItems = items.map(item => ({
    ...item,
    computed: item.value * multiplier * Math.sqrt(item.priority)
  }));
  
  // Another expensive operation
  const filteredItems = processedItems.filter(item => 
    item.name.toLowerCase().includes(filter.toLowerCase())
  );
  
  // Event handlers
  const handleIncrement = () => {
    setCount(prevCount => prevCount + 1);
  };
  
  const handleFilterChange = (e) => {
    setFilter(e.target.value);
  };
  
  return (
    <div>
      <h2>Expensive Component Demo</h2>
      <p>Count: {count}</p>
      
      <input 
        type="text" 
        value={filter} 
        onChange={handleFilterChange}
        placeholder="Filter items..."
      />
      
      <button onClick={handleIncrement}>
        Increment Count
      </button>
      
      <ul>
        {filteredItems.map(item => (
          <li key={item.id}>
            {item.name}: {item.computed.toFixed(2)}
          </li>
        ))}
      </ul>
    </div>
  );
}`;

function App() {
  const [inputCode, setInputCode] = useState(defaultCode)
  const [compiledCode, setCompiledCode] = useState('')
  const [isCompiling, setIsCompiling] = useState(false)
  const [logs, setLogs] = useState<string[]>([])

  const handleCompile = useCallback(async () => {
    setIsCompiling(true)
    setLogs(['🚀 Starting compilation...'])
    
    try {
      const response = await fetch('/api/compile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: inputCode,
          filename: 'component.tsx'
        })
      });
      
      const result = await response.json();
      
      if (result.success && result.compiledCode) {
        setCompiledCode(result.compiledCode);
        setLogs(result.logs);
      } else {
        setCompiledCode(`// Compilation failed: ${result.error || 'Unknown error'}\n\n// Original code:\n${inputCode}`);
        setLogs(result.logs || ['❌ Compilation failed']);
      }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Network error';
      setCompiledCode(`// Compilation failed: ${errorMsg}\n\n// Original code:\n${inputCode}`);
      setLogs(['❌ Error: ' + errorMsg]);
    } finally {
      setIsCompiling(false)
    }
  }, [inputCode])

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Mini React Compiler</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Optimize your React components</p>
              </div>
            </div>
          
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-12rem)]">
          {/* Input Panel */}
          <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-2">
                <Code className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Input Code</h2>
              </div>
              <button
                onClick={handleCompile}
                disabled={isCompiling}
                className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
              >
                <Play className="w-4 h-4" />
                <span>{isCompiling ? 'Compiling...' : 'Compile'}</span>
              </button>
            </div>
            <div className="flex-1 p-4">
              <CodeEditor
                value={inputCode}
                onChange={setInputCode}
                language="typescript"
                height="100%"
                placeholder="Enter your React component code here..."
              />
            </div>
          </div>

          {/* Output Panel */}
          <div className="flex flex-col bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-2 p-4 border-b border-gray-200 dark:border-gray-700">
              <Code className="w-5 h-5 text-green-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Compiled Output</h2>
            </div>
            <div className="flex-1 p-4">
              <CodeEditor
                value={compiledCode || '// Click "Compile" to see the optimized output'}
                language="javascript"
                readOnly
                height="100%"
              />
            </div>
          </div>
        </div>

        {/* Terminal Output */}
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2 p-4 border-b border-gray-200 dark:border-gray-700">
            <TerminalIcon className="w-5 h-5 text-green-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Compiler Logs</h2>
          </div>
          <div className="p-4">
            <Terminal logs={logs} />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
