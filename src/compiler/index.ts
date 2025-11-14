import * as Babel from "@babel/core";
import { types as t } from "@babel/core";
import { readInstructions, print } from "./Transform";
import { analyze } from "./Analysis";
import { codegenJS } from "./CodeGen";

// Helper to extract all identifiers from an expression (for dependency tracking)
function extractIdentifiers(node: t.Node): string[] {
  const identifiers: string[] = [];
  
  function traverse(n: t.Node) {
    if (n.type === "Identifier") {
      identifiers.push(n.name);
    } else if (n.type === "MemberExpression") {
      traverse(n.object);
      if (n.computed) {
        traverse(n.property);
      }
    } else if (n.type === "CallExpression") {
      traverse(n.callee);
      n.arguments.forEach(arg => traverse(arg));
    } else if (n.type === "ArrowFunctionExpression" || n.type === "FunctionExpression") {
      if (n.body.type === "BlockStatement") {
        n.body.body.forEach(stmt => traverse(stmt));
      } else {
        traverse(n.body);
      }
    } else if (n.type === "ObjectExpression") {
      n.properties.forEach(prop => {
        if (prop.type === "ObjectProperty") {
          traverse(prop.value);
        } else if (prop.type === "SpreadElement") {
          traverse(prop.argument);
        }
      });
    } else if (n.type === "BinaryExpression") {
      traverse(n.left);
      traverse(n.right);
    } else if (n.type === "ReturnStatement" && n.argument) {
      traverse(n.argument);
    }
  }
  
  traverse(node);
  return [...new Set(identifiers)]; // Remove duplicates
}

// Helper to check if a variable declaration contains expensive operations
function hasExpensiveOperation(node: t.VariableDeclaration): boolean {
  return node.declarations.some(decl => {
    if (!decl.init) return false;
    
    // Check for method calls like .map(), .filter(), etc.
    if (decl.init.type === "CallExpression" && decl.init.callee.type === "MemberExpression") {
      const property = decl.init.callee.property;
      if (property.type === "Identifier") {
        const expensiveMethods = ["map", "filter", "reduce", "sort", "find", "findIndex"];
        return expensiveMethods.includes(property.name);
      }
    }
    
    return false;
  });
}

// Main React Compiler plugin
export default {
  visitor: {
    FunctionDeclaration(path: Babel.NodePath<t.FunctionDeclaration>) {
      console.log("🚀 Processing function:", path.node.id?.name);
      
      // Step 1: Lower to our IR
      const instrs = readInstructions(path);
      console.log("📝 Lowered instructions:");
      print(instrs);

      // Step 2: Analyze for optimization opportunities
      const info = analyze(instrs);
      console.log("🔍 Analysis complete:");
      print(instrs, info);

      // Step 3: Generate optimized code
      const generatedBody = codegenJS(instrs, info);
      
      // Step 4: Process variable declarations in function body for expensive operations
      const bodyPath = path.get("body");
      const statements = bodyPath.get("body");
      
      let hasAnyOptimizations = generatedBody.length > 0;
      
      for (const stmt of statements) {
        if (stmt.isVariableDeclaration() && hasExpensiveOperation(stmt.node)) {
          console.log("🎯 Found expensive operation in variable declaration");
          
          // Transform the expensive operation
          for (const decl of stmt.node.declarations) {
            if (decl.init && decl.init.type === "CallExpression" && decl.init.callee.type === "MemberExpression") {
              const property = decl.init.callee.property;
              if (property.type === "Identifier") {
                const expensiveMethods = ["map", "filter", "reduce", "sort", "find", "findIndex"];
                if (expensiveMethods.includes(property.name)) {
                  // Create useMemo wrapper
                  const originalCall = decl.init;
                  
                  // Extract all dependencies from the expression
                  const allIdentifiers = extractIdentifiers(originalCall);
                  
                  // Filter out function parameters and local variables that shouldn't be dependencies
                  const dependencies = allIdentifiers.filter(id => {
                    // Exclude common function names and built-in objects
                    const excludeList = ['item', 'Math', 'console', 'window', 'document'];
                    return !excludeList.includes(id);
                  });
                  
                  console.log(`🔍 Detected dependencies: [${dependencies.join(', ')}]`);
                  
                  const memoCall = t.callExpression(
                    t.identifier("useMemo"),
                    [
                      t.arrowFunctionExpression([], originalCall),
                      t.arrayExpression(dependencies.map(dep => t.identifier(dep)))
                    ]
                  );
                  
                  decl.init = memoCall;
                  hasAnyOptimizations = true;
                  console.log(`✅ Wrapped ${property.name}() with useMemo`);
                }
              }
            }
          }
        }
      }
      
      // Step 5: Add useMemo import if needed
      if (hasAnyOptimizations) {
        const program = path.findParent((p) => p.isProgram()) as Babel.NodePath<t.Program> | null;
        if (program) {
          // Check if useMemo is already imported
          const reactImport = program.node.body.find((stmt: t.Statement) =>
            stmt.type === "ImportDeclaration" && stmt.source.value === "react"
          ) as t.ImportDeclaration | undefined;
          
          if (reactImport) {
            // Check if useMemo is already in the import
            const hasUseMemoImport = reactImport.specifiers.some((spec) =>
              spec.type === "ImportSpecifier" &&
              spec.imported.type === "Identifier" &&
              spec.imported.name === "useMemo"
            );
            
            if (!hasUseMemoImport) {
              // Add useMemo to existing React import
              reactImport.specifiers.push(
                t.importSpecifier(t.identifier("useMemo"), t.identifier("useMemo"))
              );
              console.log("📦 Added useMemo to existing React import");
            }
            
            // Also ensure useState is imported if not already present
            const hasUseStateImport = reactImport.specifiers.some((spec) =>
              spec.type === "ImportSpecifier" &&
              spec.imported.type === "Identifier" &&
              spec.imported.name === "useState"
            );
            
            if (!hasUseStateImport) {
              reactImport.specifiers.push(
                t.importSpecifier(t.identifier("useState"), t.identifier("useState"))
              );
              console.log("📦 Added useState to existing React import");
            }
          } else {
            // Add new React import with useMemo
            (program as any).unshiftContainer("body", 
              t.importDeclaration(
                [t.importSpecifier(t.identifier("useMemo"), t.identifier("useMemo"))],
                t.stringLiteral("react")
              )
            );
            console.log("📦 Added new React import with useMemo");
          }
        }
      }
      
      // Step 6: Add generated optimizations to the beginning of function
      if (generatedBody.length > 0) {
        const originalBody = path.node.body.body;
        path.get("body").replaceWith(
          t.blockStatement([...generatedBody, ...originalBody])
        );
        console.log("✅ Additional optimizations applied!");
      }
      
      if (hasAnyOptimizations) {
        console.log("🎉 Function optimized with React Compiler!");
      } else {
        console.log("ℹ️ No optimizations needed");
      }
    },
  },
} as Babel.PluginObj;
