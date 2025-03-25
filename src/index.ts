import { createInterface } from 'node:readline';
import axios from 'axios';

// Simple error types for better user messages
export enum ErrorType {
  CONNECTION = 'CONNECTION',
  AUTH = 'AUTH',
  SERVER = 'SERVER',
  UNKNOWN = 'UNKNOWN'
}

// Simple error class to help with error handling
export class McpError extends Error {
  type: ErrorType;
  
  constructor(message: string, type: ErrorType) {
    super(message);
    this.name = 'McpError';
    this.type = type;
  }
}

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
  
  // Check server connection first to provide better error message
  // But make it non-blocking - just log warnings
  try {
    log(`Checking server at ${serverUrl}...`);
    const checkApi = axios.create({
      baseURL: serverUrl,
      timeout: 5000 // Short timeout for initial check
    });
    
    await checkApi.get('/');
    log('Initial server check successful');
  } catch (error) {
    // Only log warnings, don't throw errors which would exit the process
    log('Initial connection check failed, but continuing anyway');
    if (axios.isAxiosError(error)) {
      if (!error.response) {
        log(`⚠️ Warning: Connection issue - server may be unreachable (${error.message})`);
      } else if (error.response.status === 401 || error.response.status === 403) {
        log(`⚠️ Warning: Authentication issue (${error.response.status})`);
      } else {
        log(`⚠️ Warning: Server returned status ${error.response.status}`);
      }
    } else {
      log(`⚠️ Warning: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
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
    },
    timeout: 30000 // Increase to 30 seconds to avoid client timeouts
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
        // Handle request errors with more detailed messages
        let errorMessage: string;
        let errorCode = -32000;
        
        if (axios.isAxiosError(error)) {
          if (!error.response) {
            // Network error - no response from server
            errorMessage = 'Server unreachable. Check network connection.';
            log(`Network error: ${error.message}`);
          } else if (error.response.status === 401 || error.response.status === 403) {
            // Authentication error
            errorMessage = `Authentication failed: ${error.response.data?.message || 'Invalid token'}`;
            log(`Auth error: ${error.response.status}`);
          } else if (error.response.status === 429) {
            // Rate limit error
            errorMessage = 'Rate limit exceeded. Please try again later.';
            log(`Rate limit error: ${error.response.status}`);
          } else if (error.response.status >= 500) {
            // Server error
            errorMessage = `Server error (${error.response.status}): ${error.response.data?.message || 'Internal server error'}`;
            log(`Server error: ${error.response.status}`);
          } else {
            // Other HTTP error
            errorMessage = `Error (${error.response.status}): ${error.response.data?.message || error.message}`;
            log(`HTTP error: ${error.response.status}`);
          }
        } else {
          // Non-Axios error
          errorMessage = error instanceof Error ? error.message : String(error);
          log(`Request error: ${errorMessage}`);
        }
        
        sendErrorResponse(message.id, errorCode, errorMessage);
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