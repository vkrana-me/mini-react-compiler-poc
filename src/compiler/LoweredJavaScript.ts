import chalk from "chalk";
import type {
  InstrId,
  Instruction,
  FunctionBody,
  Value
} from "./types";

// Utility to iterate over all values used by an instruction
export function* eachValue(instr: Instruction): Generator<InstrId> {
  switch (instr.kind) {
    case "Call":
      yield instr.receiver;
      for (const arg of instr.arguments) {
        if (arg.kind === "RValue") {
          yield arg.value;
        }
      }
      break;
    case "Object":
      for (const [_, value] of instr.properties) {
        if (value.kind === "RValue") {
          yield value.value;
        }
      }
      break;
    case "ReadProperty":
      yield instr.object;
      return;
    case "Declare":
      yield instr.rhs;
      return;
    case "Return":
      if (instr.value != null) {
        yield instr.value;
      }
      return;
    case "Param":
    case "LoadConstant":
      return;
  }
}

// Pretty printing utilities
export function printValueId(id: InstrId): string {
  return chalk.bold(chalk.blue("$" + id.toString()));
}

function printValue(value: Value): string {
  if (value.kind === "Literal") {
    return typeof value.value === "string"
      ? `'${value.value}'`
      : value.value.toString();
  } else {
    return printValueId(value.value);
  }
}

export function printInstr(instr: Instruction, id: number): string {
  const idStr = chalk.blue("$" + id.toString().padEnd(3, " "));
  
  switch (instr.kind) {
    case "Call":
      return `${idStr}= Call ${printValueId(instr.receiver)}${
        instr.property != null ? "." + instr.property : ""
      } (${instr.arguments.map((arg) => printValue(arg)).join(", ")})`;
    case "Object":
      const properties = Array.from(instr.properties).map(
        ([key, value]) => `${key}:${printValue(value)}`
      );
      return `${idStr}= Object {${properties.join(", ")}}`;
    case "ReadProperty":
      return `${idStr}= ReadProperty ${printValueId(instr.object)} ${
        typeof instr.property === "number"
          ? `${instr.property}`
          : `'${instr.property}'`
      }`;
    case "Declare":
      return `${idStr}= Declare '${instr.lhs}' ${printValueId(instr.rhs)}`;
    case "Param":
      return `${idStr}= Param '${instr.name}'`;
    case "LoadConstant":
      return `${idStr}= LoadConstant '${instr.variableName}'`;
    case "Return":
      return `${idStr}= Return ${
        instr.value != null ? printValueId(instr.value) : ""
      }`;
  }
}

export function printFunc(func: FunctionBody): string {
  return Array.from(func.entries())
    .map(([id, instr]) => printInstr(instr, id))
    .join("\n");
}
