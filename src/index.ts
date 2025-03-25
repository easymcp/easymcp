import { createInterface } from 'node:readline';
import axios from 'axios';

interface McpShimOptions {
  token: string;
  debug: boolean;
}

/**
 * Starts the MCP shim that forwards messages between Claude Desktop and the hosted MCP server
 */
export async function startMcpShim(options: McpShimOptions): Promise<void> {
  const { token, debug } = options;
  const serverUrl = 'https://api.easymcp.net';
  
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
      
      // Handle initialize method according to schema
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
      
      // Handle tools/list according to schema
      if (message.method === 'tools/list') {
        const toolsResponse = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            tools: [
              {
                name: 'web_search',
                description: 'Search the web for information',
                inputSchema: {
                  type: 'object',
                  properties: {
                    query: {
                      type: 'string',
                      description: 'Search query'
                    }
                  },
                  required: ['query']
                }
              }
            ]
          }
        };
        process.stdout.write(`${JSON.stringify(toolsResponse)}\n`);
        log('Sent tools list response');
        return;
      }
      
      // Handle tool/invoke according to schema
      if (message.method === 'tools/call') {
        const toolResult = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [
              {
                type: 'text',
                text: `Mock result for ${message.params?.name} with query: ${message.params?.arguments?.query || "unknown"}`
              }
            ]
          }
        };
        process.stdout.write(`${JSON.stringify(toolResult)}\n`);
        log('Sent tool invoke response');
        return;
      }
      
      // Handle prompts/list
      if (message.method === 'prompts/list') {
        const promptsResponse = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            prompts: [] // Empty list is fine for now
          }
        };
        process.stdout.write(`${JSON.stringify(promptsResponse)}\n`);
        log('Sent empty prompts list response');
        return;
      }
      
      // Handle resources/list
      if (message.method === 'resources/list') {
        const resourcesResponse = {
          jsonrpc: '2.0',
          id: message.id,
          result: {
            resources: [] // Empty list is fine for now
          }
        };
        process.stdout.write(`${JSON.stringify(resourcesResponse)}\n`);
        log('Sent empty resources list response');
        return;
      }
      
      try {
        // Forward other methods to your API
        const response = await api.post('', message);
        
        // Define the full response upfront with empty result
        const jsonRpcResponse = {
          jsonrpc: '2.0',
          id: message.id,
          result: {} // Initialize with empty object
        };
        
        // Handle different response types
        if (typeof response.data === 'string') {
          // String response - wrap as text content
          jsonRpcResponse.result = {
            content: [{ type: 'text', text: response.data }]
          };
        } else if (response.data && typeof response.data === 'object') {
          // Object response - ensure proper structure
          if (response.data.result) {
            // It has a result field - keep it
            jsonRpcResponse.result = response.data.result;
          } else {
            // No result field - wrap entire response
            jsonRpcResponse.result = {
              content: [{ type: 'text', text: JSON.stringify(response.data) }]
            };
          }
        } else {
          // Fallback for any other type
          jsonRpcResponse.result = {
            content: [{ type: 'text', text: String(response.data) }]
          };
        }
        
        process.stdout.write(`${JSON.stringify(jsonRpcResponse)}\n`);
        log(`Sent formatted response for method: ${message.method}`);
      } catch (error) {
        // Handle errors
        log(`Error processing message: ${error instanceof Error ? error.message : String(error)}`);
        
        // Send error response on JSON-RPC format
        const errorResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32000,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`
          }
        };
        
        // If the original message had an ID, include it in the error response
        try {
          const originalMessage = JSON.parse(line);
          if (originalMessage.id) {
            errorResponse.id = originalMessage.id;
          }
        } catch {} // Ignore parsing errors here
        
        process.stdout.write(`${JSON.stringify(errorResponse)}\n`);
      }
    } catch (error) {
      // Handle parsing errors
      log(`Error parsing message: ${error instanceof Error ? error.message : String(error)}`);
      
      // Send error response on JSON-RPC format
      const errorResponse = {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32000,
          message: `Error: ${error instanceof Error ? error.message : String(error)}`
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