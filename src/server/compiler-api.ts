// Server-side API for React compilation
import * as Babel from "@babel/core";
import compiler from "../compiler/index.js";

export interface CompilationRequest {
  code: string;
  filename?: string;
}

export interface CompilationResponse {
  success: boolean;
  compiledCode?: string;
  logs: string[];
  error?: string;
}

export async function compileReactCode(request: CompilationRequest): Promise<CompilationResponse> {
  const logs: string[] = [];
  
  // Capture console logs
  const originalLog = console.log;
  console.log = (...args) => {
    logs.push(args.join(' '));
    originalLog(...args);
  };
  
  try {
    logs.push('🚀 Starting server-side compilation...');
    
    const result = await Babel.transformAsync(request.code, {
      plugins: [compiler],
      parserOpts: {
        sourceType: "module",
        allowImportExportEverywhere: true,
        plugins: ["jsx", "typescript"],
      },
      filename: request.filename || 'component.tsx',
    });
    
    if (result?.code) {
      logs.push('✅ Compilation successful!');
      return {
        success: true,
        compiledCode: result.code,
        logs,
      };
    } else {
      logs.push('⚠️ No output generated');
      return {
        success: false,
        logs,
        error: 'No output generated',
      };
    }
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    logs.push(`❌ Error: ${errorMsg}`);
    
    return {
      success: false,
      logs,
      error: errorMsg,
    };
  } finally {
    console.log = originalLog;
  }
}
