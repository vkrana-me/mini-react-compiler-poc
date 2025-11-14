#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import * as Babel from "@babel/core";
import chalk from "chalk";
import compiler from "./index";

function printUsage() {
  console.log(`
${chalk.bold("Mini React Compiler CLI")}

Usage: npm run compile <input-file> [output-file]

Examples:
  npm run compile input.js
  npm run compile input.js output.js
  npm run compile src/Component.jsx dist/Component.jsx

Options:
  --help, -h    Show this help message
`);
}

async function compileFile(inputPath: string, outputPath?: string) {
  try {
    // Read input file
    const inputCode = readFileSync(inputPath, "utf-8");
    console.log(chalk.blue(`📂 Reading: ${inputPath}`));
    
    // Transform with our compiler
    const result = await Babel.transformAsync(inputCode, {
      plugins: [compiler],
      parserOpts: {
        sourceType: "module",
        allowImportExportEverywhere: true,
        plugins: ["jsx", "typescript"],
      },
    });

    if (!result?.code) {
      throw new Error("Failed to compile code");
    }

    // Write output
    if (outputPath) {
      // Ensure output directory exists
      const outputDir = dirname(outputPath);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      
      writeFileSync(outputPath, result.code);
      console.log(chalk.green(`✅ Compiled to: ${outputPath}`));
    } else {
      console.log(chalk.yellow("\n📄 Compiled output:"));
      console.log(chalk.gray("─".repeat(50)));
      console.log(result.code);
      console.log(chalk.gray("─".repeat(50)));
    }
    
  } catch (error) {
    console.error(chalk.red("❌ Compilation failed:"));
    console.error(error instanceof Error ? error.message : error);
    // Note: process.exit would need Node.js types, so we'll skip it for now
  }
}

// Main CLI logic - simplified for now
export async function main(inputFile: string, outputFile?: string) {
  if (!existsSync(inputFile)) {
    console.error(chalk.red(`❌ Input file not found: ${inputFile}`));
    return;
  }
  
  console.log(chalk.bold.cyan("🚀 Mini React Compiler"));
  console.log(chalk.gray("Inspired by bootleg-react-compiler\n"));
  
  await compileFile(inputFile, outputFile);
}

export { compileFile };
