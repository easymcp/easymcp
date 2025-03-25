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

// Show helpful message in debug mode
if (argv.debug) {
  console.error('\nEasyMCP is running in debug mode. Look for [DEBUG] messages for detailed information.');
  console.error('If you encounter connection issues:');
  console.error('1. Check that your server is running at the correct address');
  console.error('2. Verify your token at https://console.easymcp.net');
  console.error('3. Check your network connection\n');
}

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
        console.error('Please check:');
        console.error('  1. Your internet connection');
        console.error('  2. That the server is running at the correct address');
        console.error('  3. Any firewall settings that might be blocking the connection');
        console.error('\nFor status updates and support, visit: https://console.easymcp.net/status\n');
        break;
        
      case ErrorType.AUTH:
        console.error('\n❌ Authentication Error: Your token was rejected.');
        console.error('This could be because:');
        console.error('  1. Your token has expired');
        console.error('  2. Your subscription needs renewal');
        console.error('  3. You\'ve reached your usage limits');
        console.error('\nPlease visit https://console.easymcp.net to:');
        console.error('  • Renew your subscription');
        console.error('  • Upgrade your access tier');
        console.error('  • Get a new API token\n');
        break;
        
      case ErrorType.SERVER:
        console.error('\n❌ Server Error: The EasyMCP server encountered a problem.');
        console.error(`Details: ${error.message}`);
        console.error('\nThis is likely a temporary issue. Please try again later.');
        console.error('For server status and updates, check: https://console.easymcp.net/status\n');
        break;
        
      default:
        console.error(`\n❌ Error: ${error.message}`);
        console.error('If this problem persists, please contact support.');
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