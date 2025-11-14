import { types as t } from "@babel/core";
import type {
  FunctionBody,
  InstrId,
  Instruction,
  ValueInfos,
  ReactiveBlock,
  ReactiveInstruction,
  Value
} from "./types";
import { shouldMemoize } from "./Analysis";

// Simple disjoint set implementation for grouping instructions
class DisjointSet<T> {
  private parent = new Map<T, T>();
  private rank = new Map<T, number>();

  union(items: T[]): void {
    if (items.length < 2) return;
    
    const first = items[0];
    for (let i = 1; i < items.length; i++) {
      this.unionTwo(first, items[i]);
    }
  }

  private unionTwo(a: T, b: T): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    
    if (rootA === rootB) return;
    
    const rankA = this.rank.get(rootA) || 0;
    const rankB = this.rank.get(rootB) || 0;
    
    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      this.parent.set(rootB, rootA);
    } else {
      this.parent.set(rootB, rootA);
      this.rank.set(rootA, rankA + 1);
    }
  }

  private find(item: T): T {
    if (!this.parent.has(item)) {
      this.parent.set(item, item);
      this.rank.set(item, 0);
    }
    
    const parent = this.parent.get(item)!;
    if (parent !== item) {
      this.parent.set(item, this.find(parent));
    }
    
    return this.parent.get(item)!;
  }

  buildSets(): T[][] {
    const groups = new Map<T, T[]>();
    
    for (const item of this.parent.keys()) {
      const root = this.find(item);
      if (!groups.has(root)) {
        groups.set(root, []);
      }
      groups.get(root)!.push(item);
    }
    
    return Array.from(groups.values()).filter(group => group.length > 1);
  }
}

// Get instruction scope ranges for memoization
function getInstructionScopeRanges(
  func: FunctionBody,
  valuesInfo: ValueInfos
): Array<{ start: InstrId; end: InstrId }> {
  const mutatingSetBuilder = new DisjointSet<InstrId>();
  
  for (const [id, _instr] of func) {
    const info = valuesInfo.get(id);
    if (info && shouldMemoize(info)) {
      const instrs = info.instructions || new Set();
      mutatingSetBuilder.union([...instrs, id]);
    }
  }

  const mutatingSets = mutatingSetBuilder.buildSets();
  if (mutatingSets.length === 0) {
    return [];
  }

  const ranges = mutatingSets.map(set => ({
    start: Math.min(...set),
    end: Math.max(...set),
  }));

  // Sort and merge overlapping ranges
  ranges.sort((a, b) => a.start - b.start);
  
  const mergedRanges = [];
  let previous = ranges[0];
  
  for (let i = 1; i < ranges.length; i++) {
    if (previous.end >= ranges[i].start) {
      previous = {
        start: previous.start,
        end: Math.max(previous.end, ranges[i].end),
      };
    } else {
      mergedRanges.push(previous);
      previous = ranges[i];
    }
  }
  
  mergedRanges.push(previous);
  return mergedRanges;
}

// Create reactive instructions with memoization blocks
function makeReactiveInstrs(
  func: FunctionBody,
  valuesInfo: ValueInfos
): ReactiveInstruction[] {
  const scopes = getInstructionScopeRanges(func, valuesInfo);
  const hir: ReactiveInstruction[] = [];

  let startingInstrId = 0;
  
  for (const scope of scopes) {
    // Add instructions outside of scope
    for (let i = startingInstrId; i < scope.start; i++) {
      const instr = func.get(i);
      if (instr != null) {
        hir.push({ ...instr, id: i });
      }
    }

    startingInstrId = scope.end + 1;
    
    // Special case: don't memoize simple declarations
    const firstInstr = func.get(scope.start)!;
    if (scope.start === scope.end && firstInstr.kind === "Declare") {
      hir.push({ ...firstInstr, id: scope.start });
      continue;
    }

    // Create reactive block
    const currBlock: ReactiveBlock = {
      kind: "ReactiveBlock",
      instrs: new Map(),
      decls: new Set(),
      deps: new Set(),
    };
    
    for (let i = scope.start; i <= scope.end; i++) {
      const instr = func.get(i);
      if (instr != null) {
        const info = valuesInfo.get(i);
        const deps = info?.dependencies || new Set();
        
        deps.forEach((dep) => currBlock.deps.add(dep));
        currBlock.decls.add(i);
        currBlock.instrs.set(i, instr);
      }
    }
    
    hir.push(currBlock);
  }

  // Add remaining instructions
  for (let i = startingInstrId; i < func.size; i++) {
    const instr = func.get(i);
    if (instr != null) {
      hir.push({ ...instr, id: i });
    }
  }

  return hir;
}

// Convert instruction to AST expression
function instrToExpression(instr: Instruction, func: FunctionBody): t.Expression {
  switch (instr.kind) {
    case "Call":
      const receiver = func.get(instr.receiver)!;
      let callee: t.Expression;
      
      if (instr.property) {
        // Method call like items.map()
        callee = t.memberExpression(
          instrToExpression(receiver, func),
          t.identifier(instr.property)
        );
      } else {
        // Function call
        callee = instrToExpression(receiver, func);
      }
      
      const args = instr.arguments.map((arg: Value) => {
        if (arg.kind === "Literal") {
          if (typeof arg.value === "string") {
            return t.stringLiteral(arg.value);
          } else if (typeof arg.value === "number") {
            return t.numericLiteral(arg.value);
          } else if (typeof arg.value === "boolean") {
            return t.booleanLiteral(arg.value);
          }
        } else if (arg.kind === "RValue") {
          return instrToExpression(func.get(arg.value)!, func);
        }
        return t.identifier("unknown");
      });
      
      return t.callExpression(callee, args);
      
    case "Object":
      const properties: t.ObjectProperty[] = [];
      for (const [key, value] of instr.properties) {
        let valueExpr: t.Expression;
        if (value.kind === "Literal") {
          if (typeof value.value === "string") {
            valueExpr = t.stringLiteral(value.value);
          } else if (typeof value.value === "number") {
            valueExpr = t.numericLiteral(value.value);
          } else {
            valueExpr = t.booleanLiteral(value.value as boolean);
          }
        } else {
          valueExpr = instrToExpression(func.get(value.value)!, func);
        }
        properties.push(t.objectProperty(t.identifier(key), valueExpr));
      }
      return t.objectExpression(properties);
      
    case "LoadConstant":
      return t.identifier(instr.variableName);
      
    case "ReadProperty":
      const obj = instrToExpression(func.get(instr.object)!, func);
      if (typeof instr.property === "string") {
        return t.memberExpression(obj, t.identifier(instr.property));
      } else {
        return t.memberExpression(obj, t.numericLiteral(instr.property), true);
      }
      
    default:
      return t.identifier("unknown");
  }
}

// Get parameter names from dependencies
function getDependencyNames(deps: Set<InstrId>, func: FunctionBody): string[] {
  const names: string[] = [];
  for (const dep of deps) {
    const instr = func.get(dep);
    if (instr?.kind === "Param") {
      names.push(instr.name);
    } else if (instr?.kind === "Declare") {
      names.push(instr.lhs);
    }
  }
  return names;
}

// Generate optimized JavaScript code
export function codegenJS(func: FunctionBody, info: ValueInfos): t.Statement[] {
  const statements: t.Statement[] = [];
  const reactiveInstrs = makeReactiveInstrs(func, info);
  
  // Filter out dependencies that are produced within the same block
  const prunedInstrs = reactiveInstrs.map(instr => {
    if (instr.kind === "ReactiveBlock") {
      const prunedDeps = Array.from(instr.deps).filter(
        dep => !instr.instrs.has(dep)
      );
      return { ...instr, deps: new Set(prunedDeps) };
    }
    return instr;
  });

  let memoIndex = 0;
  
  for (const instr of prunedInstrs) {
    if (instr.kind === "ReactiveBlock" && instr.deps.size > 0) {
      // Find the main expensive operation in this block
      let mainOperation: Instruction | null = null;
      let mainOperationId: InstrId | null = null;
      
      for (const [id, blockInstr] of instr.instrs) {
        const instrInfo = info.get(id);
        if (instrInfo?.shouldMemo) {
          mainOperation = blockInstr;
          mainOperationId = id;
          break;
        }
      }
      
      if (mainOperation && mainOperationId !== null) {
        // Generate variable name for the memoized result
        const memoVar = `memoized${memoIndex++}`;
        
        // Get dependency names
        const depNames = getDependencyNames(instr.deps, func);
        const deps = depNames.map(name => t.identifier(name));
        
        // Convert the expensive operation to an expression
        const computation = instrToExpression(mainOperation, func);
        
        // Create useMemo call
        const useMemoCall = t.callExpression(
          t.identifier("useMemo"),
          [
            t.arrowFunctionExpression([], computation),
            t.arrayExpression(deps)
          ]
        );
        
        statements.push(
          t.variableDeclaration("const", [
            t.variableDeclarator(t.identifier(memoVar), useMemoCall)
          ])
        );
        
        console.log(`✅ Generated useMemo for expensive operation with dependencies: [${depNames.join(', ')}]`);
      }
    }
  }
  
  return statements;
}
