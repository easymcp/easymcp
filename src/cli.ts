#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { startMcpShim, ErrorType, McpError } from './index.js';

/**
 * EasyMCP CLI - A tool for connecting Claude Desktop to your services
 * 
 * Usage: 
 *   npx @easymcp/easymcp --token=YOUR_TOKEN [--debug] [--env=prod|dev]
 */

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('token', {
    alias: 't',
    type: 'string',
    description: 'API token for authentication',
    default: 'test-token',
    demandOption: true
  })
  .option('debug', {
    alias: 'd',
    type: 'boolean',
    description: 'Enable debug mode with verbose logging',
    default: false
  })
  .option('env', {
    alias: 'e',
    type: 'string',
    choices: ['dev', 'prod'],
    description: 'Environment to use (dev or prod)',
    default: 'prod'
  })
  .help()
  .alias('help', 'h')
  .parseSync();

// Mask token in logs for security
const maskedToken = maskToken(argv.token);
console.error(`Starting EasyMCP with token: ${maskedToken} (${argv.debug ? 'debug mode' : 'normal mode'}, environment: ${argv.env})`);

// Start the MCP shim
startMcpShim({
  token: argv.token,
  debug: argv.debug,
  env: argv.env as 'dev' | 'prod'
}).catch(error => {
  if (error instanceof McpError) {
    // Show user-friendly error message based on error type
    switch (error.type) {
      case ErrorType.CONNECTION:
        console.error('\n❌ Connection Error: Could not connect to the server.');
        console.error('Please check your internet connection and make sure the server is running.');
        console.error('For help, visit: https://console.easymcp.net/support\n');
        break;
        
      case ErrorType.AUTH:
        console.error('\n❌ Authentication Error: Your token was rejected.');
        console.error('Please check your token and make sure it is valid.');
        console.error('Need a new token? Visit: https://console.easymcp.net/tokens\n');
        break;
        
      case ErrorType.SERVER:
        console.error('\n❌ Server Error: The server encountered a problem.');
        console.error(`Details: ${error.message}`);
        console.error('Please try again later or check: https://console.easymcp.net/status\n');
        break;
        
      default:
        console.error(`\n❌ Error: ${error.message}`);
        console.error('For help, visit: https://console.easymcp.net/support\n');
    }
  } else {
    // Fallback for other errors
    console.error('Error running MCP shim:', error);
  }
  
  process.exit(1);
});

// Utility function to mask tokens in logs
function maskToken(token: string): string {
  if (token.length <= 4) return '*'.repeat(token.length);
  return token.slice(0, 4) + '*'.repeat(Math.max(0, token.length - 4));
} 