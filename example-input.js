// Example React component for testing the mini React compiler
function ExpensiveComponent({ items, multiplier }) {
  const [count, setCount] = useState(0);
  const [filter, setFilter] = useState('');
  
  // Expensive computation that should be memoized
  const processedItems = items.map(item => ({
    ...item,
    computed: item.value * multiplier * Math.sqrt(item.priority)
  }));
  
  // Another expensive operation
  const filteredItems = processedItems.filter(item => 
    item.name.toLowerCase().includes(filter.toLowerCase())
  );
  
  // Expensive calculation
  const totalValue = filteredItems.reduce((sum, item) => sum + item.computed, 0);
  
  // Event handlers that could benefit from useCallback
  const handleIncrement = () => {
    setCount(prevCount => prevCount + 1);
  };
  
  const handleFilterChange = (e) => {
    setFilter(e.target.value);
  };
  
  const handleReset = () => {
    setCount(0);
    setFilter('');
  };
  
  return (
    <div>
      <h2>Expensive Component Demo</h2>
      <p>Count: {count}</p>
      <p>Total Value: {totalValue.toFixed(2)}</p>
      
      <input 
        type="text" 
        value={filter} 
        onChange={handleFilterChange}
        placeholder="Filter items..."
      />
      
      <button onClick={handleIncrement}>
        Increment Count
      </button>
      
      <button onClick={handleReset}>
        Reset All
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
}

export default ExpensiveComponent;
