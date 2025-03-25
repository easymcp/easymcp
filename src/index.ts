import { createInterface } from 'node:readline';
import axios from 'axios';

interface McpShimOptions {
  token: string;
  debug: boolean;
  env: 'dev' | 'prod';
}

// Add environment configuration
const ENV_CONFIG = {
  dev: 'http://localhost:3000',
  prod: 'https://api.easymcp.net'
} as const;

/**
 * Starts the MCP shim that forwards messages between Claude Desktop and the hosted MCP server
 */
export async function startMcpShim(options: McpShimOptions): Promise<void> {
  const { token, debug, env } = options;
  const serverUrl = ENV_CONFIG[env];
  
  // Setup logging
  const log = (message: string): void => {
    if (debug) {
      console.error(`[DEBUG] ${message}`);
    }
  };
  
  // Create readline interface for stdin/stdout communication
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
  
  // Keep process alive
  process.stdin.resume();
  
  // Setup error handling
  process.on('exit', () => log('Process exiting'));
  process.on('uncaughtException', (err) => log(`Uncaught exception: ${err}`));
  process.on('unhandledRejection', (err) => log(`Unhandled rejection: ${err}`));
  
  // Keep the process alive with a heartbeat
  const keepAlive = setInterval(() => log("Heartbeat"), 30000);
  
  // Process each line from stdin
  rl.on('line', async (line) => {
    try {
      const message = JSON.parse(line);
      log(`Received: ${message.method || 'unknown method'}`);
      
      // Handle notifications (no response needed)
      if (message.method?.startsWith('notifications/')) {
        log(`Received notification: ${message.method}`);
        return;
      }
      
      // Special case for initialize - handle locally for faster startup
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
              tools: { listChanged: false }
            },
            protocolVersion: '2024-11-05'
          }
        };
        process.stdout.write(`${JSON.stringify(initializeResponse)}\n`);
        log('Initialization complete');
        return;
      }
      
      // Forward all other requests to the server
      try {
        log(`Forwarding: ${message.method}`);
        const response = await api.post('/json-rpc', message);
        
        if (response.data) {
          // Send response back to Claude
          process.stdout.write(`${JSON.stringify(response.data)}\n`);
          log(`Response sent for: ${message.method}`);
        } else {
          // Handle empty response
          sendErrorResponse(message.id, -32603, 'Server returned empty response');
          log('Empty response from server');
        }
      } catch (error) {
        // Handle request errors
        const errorMessage = error instanceof Error ? error.message : String(error);
        log(`Request error: ${errorMessage}`);
        sendErrorResponse(message.id, -32000, errorMessage);
      }
    } catch (error) {
      // Handle JSON parsing errors
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Parse error: ${errorMessage}`);
      sendErrorResponse(null, -32700, `Parse error: ${errorMessage}`);
    }
  });
  
  // Helper function to send error responses
  function sendErrorResponse(id: number | string | null, code: number, message: string): void {
    const errorResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message }
    };
    process.stdout.write(`${JSON.stringify(errorResponse)}\n`);
  }
  
  // Clean up on close
  rl.on('close', () => {
    clearInterval(keepAlive);
    log('Input stream closed, exiting');
    process.exit(0);
  });
  
  // Handle SIGINT
  process.on('SIGINT', () => {
    log('Received SIGINT signal, shutting down');
    rl.close();
  });
} 