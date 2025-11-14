import type {
  FunctionBody,
  InstrId,
  Instruction,
  ValueInfo,
  ValueInfos
} from "./types";
import { eachValue } from "./LoweredJavaScript";

// Check if an instruction is a hook call
export function isHookCall(instr: Instruction, func: FunctionBody): boolean {
  if (instr.kind === "Call") {
    const receiver = func.get(instr.receiver);
    if (receiver?.kind === "LoadConstant") {
      return receiver.variableName.startsWith("use");
    }
  }
  return false;
}

// Check if an instruction is an expensive operation
export function isExpensiveOperation(instr: Instruction, func: FunctionBody): boolean {
  if (instr.kind === "Call") {
    // Check for expensive array methods
    if (instr.property) {
      const expensiveMethods = ["map", "filter", "reduce", "sort", "find", "findIndex"];
      return expensiveMethods.includes(instr.property);
    }
    
    // Check for expensive function calls (Math operations, etc.)
    const receiver = func.get(instr.receiver);
    if (receiver?.kind === "LoadConstant") {
      const expensiveFunctions = ["Math.sqrt", "Math.pow", "Math.sin", "Math.cos"];
      return expensiveFunctions.some(fn => receiver.variableName.includes(fn.split('.')[0]));
    }
  }
  
  // Object creation is also potentially expensive
  if (instr.kind === "Object") {
    return true;
  }
  
  return false;
}

// Determine which values might change between renders
function getValuesThatMayChange(func: FunctionBody): Set<InstrId> {
  const mayChange = new Set<InstrId>();
  
  for (const [id, instr] of func) {
    if (instr.kind === "Param" || isHookCall(instr, func)) {
      // Parameters and values returned from hooks might change
      mayChange.add(id);
    } else {
      // As can anything calculated off of them
      for (const used of eachValue(instr)) {
        if (mayChange.has(used)) {
          mayChange.add(id);
        }
      }
    }
  }
  
  return mayChange;
}

// Determine which values are writable (can be mutated)
function getWritableValues(func: FunctionBody): Set<InstrId> {
  const maybeWritable = new Set<InstrId>();
  
  for (const [id, instr] of func) {
    if (["Object", "Call"].includes(instr.kind)) {
      // Creating a new object or calling a function creates a writable value
      maybeWritable.add(id);
    } else {
      // Values derived from writable values are also writable
      for (const used of eachValue(instr)) {
        if (maybeWritable.has(used)) {
          maybeWritable.add(id);
        }
      }
    }
  }
  
  return maybeWritable;
}

// Main analysis function
export function analyze(func: FunctionBody): ValueInfos {
  const result = new Map<InstrId, ValueInfo>();
  
  // Step 1: Understand which instructions should be memoized and their dependencies
  const mayChange = getValuesThatMayChange(func);
  
  for (const [id, instr] of func) {
    const dependencies = new Set<InstrId>();
    
    // Collect dependencies - values that might change
    for (const used of eachValue(instr)) {
      if (mayChange.has(used)) {
        dependencies.add(used);
      }
    }

    // Only expensive operations should be memoized
    result.set(id, {
      shouldMemo: isExpensiveOperation(instr, func) && dependencies.size > 0,
      dependencies,
    });
  }

  // Step 2: Understand writes - some instructions might write to values
  const writableValues = getWritableValues(func);
  
  for (const [id, instr] of func) {
    if (instr.kind === "Call") {
      for (const used of eachValue(instr)) {
        if (writableValues.has(used)) {
          // This call might mutate the value
          result.get(used)!.instructions ??= new Set();
          result.get(used)!.instructions!.add(id);
        }
      }
    }
  }
  
  return result;
}

// Helper to determine if a value should be memoized
export function shouldMemoize(info: ValueInfo): boolean {
  return !!(info.shouldMemo && info.dependencies && info.dependencies.size > 0);
}
