// Vite plugin for React compilation API
import type { Plugin } from 'vite';
import { compileReactCode } from './src/server/compiler-api.js';
import type { CompilationRequest, CompilationResponse } from './src/server/compiler-api.js';

export function reactCompilerPlugin(): Plugin {
  return {
    name: 'react-compiler-api',
    configureServer(server) {
      server.middlewares.use('/api/compile', async (req, res, next) => {
        if (req.method === 'POST') {
          let body = '';
          
          req.on('data', chunk => {
            body += chunk.toString();
          });
          
          req.on('end', async () => {
            try {
              const request: CompilationRequest = JSON.parse(body);
              const response: CompilationResponse = await compileReactCode(request);
              
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
              
              res.statusCode = 200;
              res.end(JSON.stringify(response));
            } catch (error) {
              res.statusCode = 400;
              res.end(JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Invalid request',
                logs: []
              }));
            }
          });
        } else if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.statusCode = 200;
          res.end();
        } else {
          next();
        }
      });
    }
  };
}
