import { createInterface } from 'node:readline';
import axios from 'axios';

interface McpShimOptions {
  token: string;
  debug: boolean;
  server?: string;
}

/**
 * Starts the MCP shim that forwards messages between Claude Desktop and the hosted MCP server
 */
export async function startMcpShim(options: McpShimOptions): Promise<void> {
  const { token, debug } = options;
  const serverUrl = options.server || 'http://localhost:3000';
  
  // Setup logging
  const log = (message: string): void => {
    if (debug) {
      console.error(`[DEBUG] ${message}`);
    }
  };
  
  // Create readline interface
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });
  
  // Set up axios instance with authentication
  const api = axios.create({
    baseURL: serverUrl,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  log("MCP shim started");
  log(`Connecting to server: ${serverUrl}`);
  
  // Add immediately to prevent early exits
  process.stdin.resume(); // Keep process alive even when stdin ends
  
  // Add more debugging for process events
  process.on('exit', () => console.error('[DEBUG] Process exiting'));
  process.on('uncaughtException', (err) => console.error('[DEBUG] Uncaught exception:', err));
  process.on('unhandledRejection', (err) => console.error('[DEBUG] Unhandled rejection:', err));
  
  // Move the keepAlive right after initialization
  const keepAlive = setInterval(() => {
    log("Keeping process alive...");
  }, 10000); // Use a shorter interval for testing
  
  log("Process should stay alive. Keep-alive interval started.");
  
  // Process each line from stdin
  rl.on('line', async (line) => {
    try {
      const message = JSON.parse(line);
      log(`Received message: ${JSON.stringify(message)}`);
      
      // Special handling for notifications
      if (message.method?.startsWith('notifications/')) {
        log(`Received notification: ${message.method}`);
        // Don't send a response for notifications
        return;
      }
      
      // Special case for initialize - we'll handle it ourselves for efficiency
      if (message.method === 'initialize') {
        const initializeResponse = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            serverInfo: {
              name: 'easymcp-shim',
              version: '1.0.0'
            },
            capabilities: {
              tools: { listChanged: false } // We support tools
            },
            protocolVersion: '2024-11-05' // Must match what client requested
          }
        };
        process.stdout.write(`${JSON.stringify(initializeResponse)}\n`);
        log('Sent initialize response');
        return;
      }
      
      try {
        // Forward all other requests to the server
        log(`Forwarding ${message.method} request to server`);
        const response = await api.post('/json-rpc', message);
        
        // Add extra debugging for tools/list
        if (message.method === 'tools/list') {
          log(`tools/list response received: ${JSON.stringify(response.data, null, 2)}`);
        }
        
        if (response.data) {
          process.stdout.write(`${JSON.stringify(response.data)}\n`);
          log(`Sent server response for ${message.method}`);
        } else {
          // Server returned something invalid, create generic response
          const fallbackResponse = {
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: -32603,
              message: 'Server returned invalid response'
            }
          };
          process.stdout.write(`${JSON.stringify(fallbackResponse)}\n`);
          log('Sent fallback error response');
        }
      } catch (error) {
        // Handle errors
        log(`Error forwarding request: ${error instanceof Error ? error.message : String(error)}`);
        
        // Send error response in JSON-RPC format
        const errorResponse = {
          jsonrpc: '2.0',
          id: message.id ?? null,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : String(error)
          }
        };
        
        process.stdout.write(`${JSON.stringify(errorResponse)}\n`);
        log('Sent error response');
      }
    } catch (error) {
      // Handle parsing errors
      log(`Error parsing message: ${error instanceof Error ? error.message : String(error)}`);
      
      // Send error response in JSON-RPC format
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${error instanceof Error ? error.message : String(error)}`
        }
      };
      
      process.stdout.write(`${JSON.stringify(errorResponse)}\n`);
    }
  });
  
  // Clear the interval when stdin closes
  rl.on('close', () => {
    clearInterval(keepAlive);
    log('Input stream closed, exiting...');
    process.exit(0);
  });
  
  // Keep the process alive
  process.on('SIGINT', () => {
    log('Received SIGINT signal, shutting down...');
    rl.close();
  });
} 