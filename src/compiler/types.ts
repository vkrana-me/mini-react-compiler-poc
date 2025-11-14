import { types as t } from "@babel/core";

// Core instruction ID type
export type InstrId = number;

// Value types in our IR
export type Value =
  | { kind: "RValue"; value: InstrId }
  | { kind: "Literal"; value: string | number | boolean };

// Instruction types
export type MethodCall = {
  kind: "Call";
  receiver: InstrId;
  property: string | null;
  arguments: Array<Value>;
  loc: t.SourceLocation | null;
};

export type ObjectExpression = {
  kind: "Object";
  properties: Map<string, Value>;
  loc: t.SourceLocation | null;
};

export type MemberExpression = {
  kind: "ReadProperty";
  object: InstrId;
  property: string | number;
  loc: t.SourceLocation | null;
};

export type VariableDeclaration = {
  kind: "Declare";
  lhs: string;
  rhs: InstrId;
  loc: t.SourceLocation | null;
};

export type Param = {
  kind: "Param";
  name: string;
  loc: t.SourceLocation | null;
};

export type LoadConstant = {
  kind: "LoadConstant";
  variableName: string;
  loc: t.SourceLocation | null;
};

export type Return = {
  kind: "Return";
  value: InstrId | null;
  loc: t.SourceLocation | null;
};

export type Instruction =
  | MethodCall
  | MemberExpression
  | VariableDeclaration
  | Param
  | LoadConstant
  | Return
  | ObjectExpression;

// Function body is a map of instruction IDs to instructions
export type FunctionBody = Map<InstrId, Instruction>;

// Analysis information for each value
export type ValueInfo = {
  dependencies?: Set<InstrId>;
  instructions?: Set<InstrId>;
  shouldMemo?: boolean;
};

export type ValueInfos = Map<InstrId, ValueInfo>;

// Reactive blocks for memoization
export type ReactiveBlock = {
  kind: "ReactiveBlock";
  instrs: Map<InstrId, Instruction>;
  decls: Set<InstrId>;
  deps: Set<InstrId>;
};

export type ReactiveInstruction =
  | ReactiveBlock
  | (Instruction & { id: InstrId });
