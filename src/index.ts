import { createInterface } from 'node:readline';
import axios from 'axios';

// Simple error types for better user messages
export enum ErrorType {
  CONNECTION = 'CONNECTION',
  AUTH = 'AUTH',
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  AUTH_INVALID = 'AUTH_INVALID',
  AUTH_LIMITS = 'AUTH_LIMITS',
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
            
            // Check for error responses indicating token issues
            if (response.data?.error) {
              const error = response.data.error;
              const errorMsg = error.message || '';
              
              // Error detection based on code and message content
              if (error.code === -32001 || errorMsg.toLowerCase().includes('expired')) {
                log('\n🚫 Token Expired - Authentication Failure 🚫');
                log('----------------------------------------------');
                log('Your EasyMCP token has expired and needs to be renewed.');
                
                // Pass through the error to Claude so it shows the MCP as disabled/red
                sendErrorResponse(message.id, -32001, `Authentication Error: Your token has expired.`);
                
                // Also throw the error for CLI
                throw new McpError(
                  'Your authentication token has expired. Please renew your subscription.',
                  ErrorType.AUTH_EXPIRED
                );
              } else if (error.code === -32004 || errorMsg.toLowerCase().includes('usage limit') || errorMsg.toLowerCase().includes('upgrade your plan')) {
                log('\n🚫 Usage Limits Exceeded 🚫');
                log('---------------------------');
                log('You have reached your EasyMCP usage limits for this billing period.');
                
                // Pass through the error to Claude so it shows the MCP as disabled/red
                sendErrorResponse(message.id, -32004, `Usage Limit Error: You have reached your usage limits.`);
                
                // Also throw the error for CLI
                throw new McpError(
                  'You have reached your usage limits. Please upgrade your plan.',
                  ErrorType.AUTH_LIMITS
                );
              } else if (error.code === -32003 || errorMsg.toLowerCase().includes('invalid token') || 
                         (error.code === -32600 && errorMsg.toLowerCase().includes('unauthorized'))) {
                log('\n🚫 Invalid Authentication Token 🚫');
                log('--------------------------------');
                log('Your EasyMCP token was not recognized or is invalid.');
                
                // Pass through the error to Claude so it shows the MCP as disabled/red
                sendErrorResponse(message.id, -32003, `Authentication Error: Invalid or unrecognized token.`);
                
                // Also throw the error for CLI
                throw new McpError(
                  'Your authentication token is invalid. Please check or renew your token.',
                  ErrorType.AUTH_INVALID
                );
              }
              
              // For other errors, return an empty tool list but log the error
              log(`⚠️ Server returned an error: ${errorMsg}`);
              const emptyToolsResponse = {
                jsonrpc: '2.0',
                id: message.id,
                result: {
                  tools: []
                }
              };
              process.stdout.write(`${JSON.stringify(emptyToolsResponse)}\n`);
              return;
            }
            
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
            // Check for auth errors specifically for tools/list
            if (axios.isAxiosError(error)) {
              // If we have an error response, check for specific error codes
              if (error.response) {
                const status = error.response.status;
                const errorData = error.response.data?.error || error.response.data;
                const errorMsg = errorData?.message || '';
                
                // Handle token expiration (401/403 with specific messages)
                if ((status === 401 || status === 403) && 
                    (errorMsg.toLowerCase().includes('expired') || errorData?.code === -32001)) {
                  log('\n🚫 Token Expired - Authentication Failure 🚫');
                  log('----------------------------------------------');
                  log('Your EasyMCP token has expired and needs to be renewed.');
                  
                  // Pass through the error to Claude so it shows the MCP as disabled/red
                  sendErrorResponse(message.id, -32001, `Authentication Error: Your token has expired.`);
                  
                  // Also throw the error for CLI
                  throw new McpError(
                    'Your authentication token has expired. Please renew your subscription.',
                    ErrorType.AUTH_EXPIRED
                  );
                } 
                // Handle usage limits
                else if ((status === 403 || status === 429) && 
                        (errorMsg.toLowerCase().includes('limit') || 
                         errorMsg.toLowerCase().includes('quota') || 
                         errorData?.code === -32004 || 
                         errorData?.code === -32029)) {
                  log('\n🚫 Usage Limits Exceeded 🚫');
                  log('---------------------------');
                  log('You have reached your EasyMCP usage limits for this billing period.');
                  
                  // Pass through the error to Claude so it shows the MCP as disabled/red
                  sendErrorResponse(message.id, -32004, `Usage Limit Error: You have reached your usage limits.`);
                  
                  // Also throw the error for CLI
                  throw new McpError(
                    'You have reached your usage limits. Please upgrade your plan.',
                    ErrorType.AUTH_LIMITS
                  );
                }
                // Handle invalid token
                else if ((status === 401 || status === 403) && 
                        (errorMsg.toLowerCase().includes('invalid') || 
                         errorData?.code === -32003)) {
                  log('\n🚫 Invalid Authentication Token 🚫');
                  log('--------------------------------');
                  log('Your EasyMCP token was not recognized or is invalid.');
                  
                  // Pass through the error to Claude so it shows the MCP as disabled/red
                  sendErrorResponse(message.id, -32003, `Authentication Error: Invalid or unrecognized token.`);
                  
                  // Also throw the error for CLI
                  throw new McpError(
                    'Your authentication token is invalid. Please check or renew your token.',
                    ErrorType.AUTH_INVALID
                  );
                }
                // Any other auth error
                else if (status === 401 || status === 403) {
                  log('\n🚫 Authentication Error 🚫');
                  log('-----------------------');
                  log(`The server rejected your authentication: ${errorMsg}`);
                  
                  // Pass through the error to Claude so it shows the MCP as disabled/red
                  sendErrorResponse(message.id, -32003, `Authentication Error: ${errorMsg}`);
                  
                  // Also throw the error for CLI
                  throw new McpError(
                    `Authentication failed: ${errorMsg}`,
                    ErrorType.AUTH
                  );
                }
              }
              // Handle connection issues
              else if (!error.response) {
                log('\n⚠️ Connection Issue - Server Unreachable ⚠️');
                log('------------------------------------------');
                log('EasyMCP cannot connect to the server. Please check your:');
                log('1. Internet connection');
                log('2. Server status at ' + serverUrl);
                log('3. Firewall settings');
                
                // Pass through the error to Claude so it shows the MCP as disabled/red
                sendErrorResponse(message.id, -32001, `Connection Error: Cannot connect to the EasyMCP server.`);
                
                // Also throw the error for CLI
                throw new McpError(
                  'Cannot connect to the EasyMCP server. Please check your network and server status.',
                  ErrorType.CONNECTION
                );
              }
            }
            
            // For non-auth errors or other errors, return empty tools list
            const emptyToolsResponse = {
              jsonrpc: '2.0',
              id: message.id,
              result: {
                tools: []
              }
            };
            process.stdout.write(`${JSON.stringify(emptyToolsResponse)}\n`);
            log('Returning empty tools list due to server error');
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
            // Authentication error - inspect the error message to determine the specific issue
            const errorData = error.response.data;
            const errorMsg = errorData?.error?.message || errorData?.message || 'Invalid token';
            
            // Determine specific auth error type based on the error message
            if (errorMsg.toLowerCase().includes('expired')) {
              // Token has expired
              errorMessage = 'Your authentication token has expired. Please renew your subscription.';
              errorCode = -32003; // Auth error
              log(`⚠️ Token expired: ${errorMsg}`);
              log('   Please visit https://console.easymcp.net to renew your subscription.');
              
              // Display error and exit directly
              console.error('\n❌ Token Expired: Your EasyMCP subscription has expired.');
              console.error('Your authentication token is no longer valid because your subscription has ended.');
              console.error('\nTo continue using EasyMCP:');
              console.error('  1. Visit https://console.easymcp.net/subscription');
              console.error('  2. Renew your subscription');
              console.error('  3. Generate a new token\n');
              process.exit(1);
            } else if (errorMsg.toLowerCase().includes('limit') || 
                       errorMsg.toLowerCase().includes('quota')) {
              // Usage limits exceeded
              errorMessage = 'You have reached your usage limits. Please upgrade your plan.';
              errorCode = -32004; // Rate limit error
              log(`⚠️ Usage limits exceeded: ${errorMsg}`);
              log('   Please visit https://console.easymcp.net to upgrade your plan.');
              
              // Display error and exit directly
              console.error('\n❌ Usage Limits Reached: You have reached your plan limits.');
              console.error('Your current subscription plan does not allow additional usage at this time.');
              console.error('\nTo increase your limits:');
              console.error('  1. Visit https://console.easymcp.net/subscription');
              console.error('  2. Upgrade to a higher tier plan with increased limits');
              console.error('  3. Contact support if you need a custom plan\n');
              process.exit(1);
            } else {
              // Generic auth error (invalid token, etc.)
              errorMessage = `Authentication failed: Invalid or unrecognized token`;
              errorCode = -32003; // Auth error
              log(`⚠️ Authentication failed: ${errorMsg}`);
              log('   Please check your token and visit https://console.easymcp.net if issues persist.');
              
              // Display error and exit directly
              console.error('\n❌ Invalid Token: Your authentication token was rejected.');
              console.error('This token is not recognized by the EasyMCP server.');
              console.error('\nTo fix this issue:');
              console.error('  1. Check that you copied the token correctly');
              console.error('  2. Generate a new token at https://console.easymcp.net/tokens');
              console.error('  3. Make sure you are using the correct environment (dev/prod)\n');
              process.exit(1);
            }
          } else if (error.response.status === 429) {
            // Rate limit error
            errorMessage = 'Rate limit exceeded. Please try again later.';
            errorCode = -32029; // Custom code for rate limiting
            log(`Rate limit error: ${error.response.status}`);
            log('⚠️ Rate limit exceeded. You have reached your usage limits.');
            log('   Consider upgrading your plan at https://console.easymcp.net for increased limits.');
            
            // Display error and exit directly
            console.error('\n❌ Rate Limit Exceeded: You have reached your usage limits.');
            console.error('Your current subscription plan does not allow additional requests at this time.');
            console.error('\nTo resolve this issue:');
            console.error('  1. Wait a few minutes and try again');
            console.error('  2. Visit https://console.easymcp.net/subscription to upgrade your plan');
            console.error('  3. Contact support if you need a custom plan with higher limits\n');
            process.exit(1);
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