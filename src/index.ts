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
    timeout: 60000 // Increase to 60 seconds for long operations
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
        
        // Special handling for tools/list to avoid error when server is offline
        if (message.method === 'tools/list') {
          try {
            const response = await api.post('/json-rpc', message);
            
            if (response.data) {
              // Send response back to Claude
              process.stdout.write(`${JSON.stringify(response.data)}\n`);
              log(`Response sent for: ${message.method}`);
            } else {
              // Return empty tools list instead of error
              const emptyToolsResponse = {
                jsonrpc: '2.0',
                id: message.id,
                result: {
                  tools: []
                }
              };
              process.stdout.write(`${JSON.stringify(emptyToolsResponse)}\n`);
              log('Returning empty tools list due to server unreachable');
            }
          } catch (error) {
            // Return empty tools list instead of error
            const emptyToolsResponse = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                tools: []
              }
            };
            process.stdout.write(`${JSON.stringify(emptyToolsResponse)}\n`);
            log('Returning empty tools list due to server error');
            
            // Show helpful message about connection issues
            if (axios.isAxiosError(error)) {
              if (!error.response) {
                // This is a connection issue
                log('\n⚠️ Connection Problem Detected ⚠️');
                log('-------------------------------');
                log('EasyMCP cannot connect to the server. Claude will function without tools.');
                log('\nPossible solutions:');
                log('1. Check your internet connection');
                log('2. Ensure the server is running at ' + serverUrl);
                log('3. Check any firewall settings');
                log('\nFor help, visit: https://console.easymcp.net/status\n');
              } else if (error.response.status === 401 || error.response.status === 403) {
                // Authentication issue
                log('\n⚠️ Authentication Problem Detected ⚠️');
                log('----------------------------------');
                log('Your EasyMCP token was rejected. Claude will function without tools.');
                log('\nPlease visit https://console.easymcp.net to:');
                log('• Renew your subscription if expired');
                log('• Check your usage limits');
                log('• Get a new API token\n');
              }
            }
          }
          return;
        }
        
        // For all other requests, handle normally
        const response = await api.post('/json-rpc', message);
        
        if (response.data) {
          // Send response back to Claude
          process.stdout.write(`${JSON.stringify(response.data)}\n`);
          log(`Response sent for: ${message.method}`);
          
          // Don't log anything for method not found errors
          // Just silently forward the response to Claude
        } else {
          // Handle empty response
          sendErrorResponse(message.id, -32603, 'Server returned empty response');
          log('Empty response from server');
        }
      } catch (error) {
        // Handle request errors with more detailed messages
        let errorMessage: string;
        let errorCode: number;
        
        if (axios.isAxiosError(error)) {
          if (!error.response) {
            // Network error - no response from server
            errorMessage = 'Server unreachable. Please check your network connection and server status.';
            errorCode = -32001; // Standard JSON-RPC timeout error
            log(`Network error: ${error.message}`);
            log('⚠️ Connection issue detected. Please check your internet connection and server status.');
            log('   If this persists, check https://console.easymcp.net/status for service updates.');
          } else if (error.response.status === 401 || error.response.status === 403) {
            // Authentication error
            errorMessage = `Authentication failed: ${error.response.data?.message || 'Invalid token'}`;
            errorCode = -32003; // Claude uses this for auth errors
            log(`Auth error: ${error.response.status}`);
            log('⚠️ Authentication failed. Your token may be expired or invalid.');
            log('   Please visit https://console.easymcp.net to renew your subscription or get a new token.');
          } else if (error.response.status === 429) {
            // Rate limit error
            errorMessage = 'Rate limit exceeded. Please try again later.';
            errorCode = -32029; // Custom code for rate limiting
            log(`Rate limit error: ${error.response.status}`);
            log('⚠️ Rate limit exceeded. You have reached your usage limits.');
            log('   Consider upgrading your plan at https://console.easymcp.net for increased limits.');
          } else if (error.response.status >= 500) {
            // Server error
            errorMessage = `Server error: ${error.response.data?.message || 'Internal server error'}`;
            errorCode = -32000; // Standard JSON-RPC server error
            log(`Server error: ${error.response.status}`);
            log('⚠️ EasyMCP server encountered an internal error.');
            log('   This is likely temporary. Please try again later or check status at https://console.easymcp.net/status');
          } else if (error.response?.status === 404 || 
                   (error.response?.data?.error?.code === -32601)) {
            // Method not found error - silently return without logging
            const methodName = message.method;
            errorMessage = `Method not found: ${methodName}`;
            errorCode = -32601;
            
            // Don't log anything for method not found errors
          } else {
            // Other HTTP error
            errorMessage = `Request failed: ${error.response.data?.message || error.message}`;
            errorCode = -32602; // Invalid params
            log(`HTTP error: ${error.response.status}`);
            log(`⚠️ Request to server failed with status ${error.response.status}`);
          }
        } else {
          // Non-Axios error
          errorMessage = error instanceof Error ? error.message : String(error);
          errorCode = -32603; // Internal JSON-RPC error
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