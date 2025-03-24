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
  
  // Create readline interface to read from stdin
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
  
  // Log if debug is enabled
  const log = (message: string): void => {
    if (debug) {
      console.error(`[DEBUG] ${message}`);
    }
  };
  
  log("MCP shim started");
  
  // Process each line from stdin
  rl.on('line', async (line) => {
    try {
      // Parse the JSON-RPC message
      const message = JSON.parse(line);
      log(`Received message: ${JSON.stringify(message)}`);
      
      // Forward the message to the hosted MCP server
      const response = await api.post('', message);
      
      // Write the response back to stdout
      process.stdout.write(`${JSON.stringify(response.data)}\n`);
      log(`Sent response: ${JSON.stringify(response.data)}`);
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
  });
  
  // Handle exit
  rl.on('close', () => {
    log('Input stream closed, exiting...');
    process.exit(0);
  });
} 