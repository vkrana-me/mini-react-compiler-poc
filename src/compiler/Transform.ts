import { NodePath, types as t } from "@babel/core";
import chalk from "chalk";
import type {
  FunctionBody,
  InstrId,
  Instruction,
  Value,
  ValueInfo,
  ValueInfos
} from "./types";
import { printInstr, printFunc, printValueId } from "./LoweredJavaScript";

function assertsValid(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    throw new Error("Invalid syntax. " + (msg || ""));
  }
}

export function logInstr(func: FunctionBody, id: number) {
  const instr = func.get(id)!;
  console.log(printInstr(instr, id));
}

function getDeclaration(func: FunctionBody, variableName: string): InstrId | null {
  for (const [id, instr] of func.entries()) {
    if (instr.kind === "Declare" && instr.lhs === variableName) {
      return id;
    } else if (instr.kind === "Param" && instr.name === variableName) {
      return id;
    }
  }
  return null;
}

export function lowerBabelInstr(
  instr: NodePath<t.Node>,
  state: FunctionBody
): InstrId {
  if (instr.isMemberExpression()) {
    const objectValue = lowerBabelInstr(instr.get("object"), state);
    const property = instr.get("property");
    let propertyName: string | number;
    
    if (property.isIdentifier()) {
      propertyName = property.node.name;
    } else if (property.isNumericLiteral()) {
      propertyName = property.node.value;
    } else if (property.isStringLiteral()) {
      propertyName = property.node.value;
    } else {
      throw new Error(`Unsupported property type: ${property.node.type}`);
    }

    const currValue = state.size;
    state.set(currValue, {
      kind: "ReadProperty",
      object: objectValue,
      property: propertyName,
      loc: instr.node.loc || null,
    });
    logInstr(state, currValue);
    return currValue;
  } else if (instr.isObjectExpression()) {
    const propertyValues: Map<string, Value> = new Map();
    
    for (const prop of instr.get("properties")) {
      if (prop.isObjectProperty()) {
        const key = prop.get("key");
        const value = prop.get("value");
        
        assertsValid(key.isIdentifier(), "Only identifier keys supported");
        
        let loweredValue: Value;
        if (value.isStringLiteral() || value.isNumericLiteral() || value.isBooleanLiteral()) {
          loweredValue = {
            kind: "Literal",
            value: value.node.value,
          };
        } else {
          loweredValue = {
            kind: "RValue",
            value: lowerBabelInstr(value, state),
          };
        }
        propertyValues.set(key.node.name, loweredValue);
      }
    }

    const currValue = state.size;
    state.set(currValue, {
      kind: "Object",
      properties: propertyValues,
      loc: instr.node.loc || null,
    });
    logInstr(state, currValue);
    return currValue;
  } else if (instr.isCallExpression()) {
    const callee = instr.get("callee");
    let receiverValue: InstrId;
    let propertyName: string | null = null;

    if (callee.isMemberExpression()) {
      receiverValue = lowerBabelInstr(callee.get("object"), state);
      const property = callee.get("property");
      assertsValid(property.isIdentifier(), "Only identifier properties supported");
      propertyName = property.node.name;
    } else {
      receiverValue = lowerBabelInstr(callee, state);
    }

    const argumentValues: Array<Value> = [];
    for (const arg of instr.get("arguments")) {
      if (arg.isNumericLiteral() || arg.isStringLiteral() || arg.isBooleanLiteral()) {
        argumentValues.push({
          kind: "Literal",
          value: arg.node.value,
        });
      } else {
        argumentValues.push({
          kind: "RValue",
          value: lowerBabelInstr(arg, state),
        });
      }
    }

    const currValue = state.size;
    state.set(currValue, {
      kind: "Call",
      receiver: receiverValue,
      property: propertyName,
      arguments: argumentValues,
      loc: instr.node.loc || null,
    });
    logInstr(state, currValue);
    return currValue;
  } else if (instr.isReturnStatement()) {
    const argument = instr.get("argument");
    let argumentValue: InstrId | null = null;
    
    if (argument.node != null) {
      argumentValue = lowerBabelInstr(argument as NodePath<t.Expression>, state);
    }

    const currValue = state.size;
    state.set(currValue, {
      kind: "Return",
      value: argumentValue,
      loc: instr.node.loc || null,
    });
    logInstr(state, currValue);
    return currValue;
  } else if (instr.isVariableDeclaration()) {
    const declarations = instr.get("declarations");
    let lastValue = state.size;
    
    for (const decl of declarations) {
      if (decl.isVariableDeclarator()) {
        const id = decl.get("id");
        const init = decl.get("init");
        
        assertsValid(init.node != null, "Variable must have initializer");
        
        if (id.isIdentifier()) {
          // Simple variable declaration: const x = value
          const initValue = lowerBabelInstr(init as NodePath<t.Expression>, state);
          const currValue = state.size;
          state.set(currValue, {
            kind: "Declare",
            lhs: id.node.name,
            rhs: initValue,
            loc: instr.node.loc || null,
          });
          logInstr(state, currValue);
          lastValue = currValue;
        } else if (id.isArrayPattern()) {
          // Array destructuring: const [a, b] = value
          const initValue = lowerBabelInstr(init as NodePath<t.Expression>, state);
          
          // For now, we'll create a single instruction for the whole destructuring
          // In a more complete implementation, we'd handle each element separately
          const currValue = state.size;
          state.set(currValue, {
            kind: "Declare",
            lhs: `[${id.node.elements.map((el, i) => 
              el && el.type === "Identifier" ? el.name : `_${i}`
            ).join(', ')}]`,
            rhs: initValue,
            loc: instr.node.loc || null,
          });
          logInstr(state, currValue);
          lastValue = currValue;
        } else {
          // Skip other patterns for now (object destructuring, etc.)
          console.log(`⚠️ Skipping unsupported declaration pattern: ${id.node.type}`);
        }
      }
    }
    return lastValue;
  } else if (instr.isIdentifier()) {
    const name = instr.node.name;
    const localDeclaration = getDeclaration(state, name);
    
    if (localDeclaration != null) {
      return localDeclaration;
    } else {
      const currValue = state.size;
      state.set(currValue, {
        kind: "LoadConstant",
        variableName: name,
        loc: instr.node.loc || null,
      });
      logInstr(state, currValue);
      return currValue;
    }
  } else if (instr.isExpressionStatement()) {
    return lowerBabelInstr(instr.get("expression"), state);
  } else if (instr.isStringLiteral() || instr.isNumericLiteral() || instr.isBooleanLiteral()) {
    // Handle literal values
    const currValue = state.size;
    state.set(currValue, {
      kind: "LoadConstant",
      variableName: String(instr.node.value),
      loc: instr.node.loc || null,
    });
    logInstr(state, currValue);
    return currValue;
  } else if (instr.isArrowFunctionExpression() || instr.isFunctionExpression()) {
    // Handle function expressions - for now, treat as a constant
    const currValue = state.size;
    state.set(currValue, {
      kind: "LoadConstant",
      variableName: "function",
      loc: instr.node.loc || null,
    });
    logInstr(state, currValue);
    return currValue;
  } else {
    // Fallback for unsupported instructions - log but don't fail
    console.log(`⚠️ Skipping unsupported instruction: ${instr.node.type}`);
    const currValue = state.size;
    state.set(currValue, {
      kind: "LoadConstant",
      variableName: `unsupported_${instr.node.type}`,
      loc: instr.node.loc || null,
    });
    logInstr(state, currValue);
    return currValue;
  }
}

export function readInstructions(
  func: NodePath<t.FunctionDeclaration>
): Map<InstrId, Instruction> {
  const instrs = new Map<InstrId, Instruction>();

  // Process parameters
  for (const param of func.get("params")) {
    if (param.isObjectPattern()) {
      const properties = param.get("properties");
      for (const property of properties) {
        assertsValid(property.isObjectProperty(), `Cannot handle ${property.node.type} in param`);
        const key = property.get("key");
        assertsValid(key.isIdentifier(), `Cannot handle non-identifier key in destructured param`);
        
        const paramValue = instrs.size;
        instrs.set(paramValue, {
          kind: "Param",
          name: key.node.name,
          loc: key.node.loc || null,
        });
      }
    } else {
      assertsValid(param.isIdentifier(), `Cannot handle non-identifier param ${param.node.type}`);
      
      const paramValue = instrs.size;
      instrs.set(paramValue, {
        kind: "Param",
        name: param.node.name,
        loc: param.node.loc || null,
      });
    }
  }

  // Process function body
  for (const instr of func.get("body").get("body")) {
    lowerBabelInstr(instr, instrs);
  }

  return instrs;
}

export function print(func: FunctionBody, infos?: ValueInfos) {
  if (infos) {
    console.log(printFunc(func));
    for (const [id, info] of infos) {
      console.log(printValueInfo(id, info));
    }
  } else {
    for (const id of func.keys()) {
      logInstr(func, id);
    }
  }
}

function printValueInfo(id: InstrId, info: ValueInfo): string {
  let infoStr = printValueId(id) + ": ";
  
  if (info.dependencies == null && info.shouldMemo == null && info.instructions == null) {
    infoStr += chalk.dim(" (missing data)");
    return infoStr;
  }
  
  if (info.dependencies != null) {
    infoStr += `deps=[${[...info.dependencies]}]`.padEnd(11);
  }
  
  if (info.instructions != null) {
    infoStr += `mut=[${[...info.instructions]}]`.padEnd(12);
  }
  
  if (calcShouldMemo(info)) {
    infoStr += chalk.bold(chalk.green("memo")) + " ";
  } else {
    infoStr += chalk.dim("no-memo") + " ";
  }
  
  return infoStr;
}

function calcShouldMemo(info: ValueInfo): boolean {
  const { dependencies, shouldMemo } = info;
  if (shouldMemo != null) {
    return shouldMemo;
  }
  return dependencies != null && dependencies.size > 0;
}
