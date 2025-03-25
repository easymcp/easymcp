#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { startMcpShim, ErrorType, McpError } from './index.js';

/**
 * EasyMCP CLI - A tool for connecting Claude Desktop to your services
 * 
 * Usage: 
 *   npx @easymcp/easymcp [--debug] [--env=prod|dev]
 *   
 * Environment Variables:
 *   EASYMCP_TOKEN - API token for authentication (required)
 */

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
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

// Get token from environment variable
const token = process.env.EASYMCP_TOKEN;

// Check if token is provided
if (!token) {
  console.error('\n❌ Authentication Error: No token provided');
  console.error('EASYMCP_TOKEN environment variable is required.');
  console.error('\nPlease set the environment variable in your MCP server configuration:');
  console.error(`
{
  "mcpServers": {
    "EasyMCP.net": {
      "command": "npx",
      "args": ["@easymcp/easymcp"],
      "env": {
        "EASYMCP_TOKEN": "your_token"
      }
    }
  }
}`);
  console.error('\nFor more information, visit: https://console.easymcp.net/tokens\n');
  process.exit(1);
}

// Mask token in logs for security
const maskedToken = maskToken(token);
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
  token,
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
        
      case ErrorType.AUTH_EXPIRED:
        console.error('\n❌ Token Expired: Your EasyMCP subscription has expired.');
        console.error('Your authentication token is no longer valid because your subscription has ended.');
        console.error('\nTo continue using EasyMCP:');
        console.error('  1. Visit https://console.easymcp.net/subscription');
        console.error('  2. Renew your subscription');
        console.error('  3. Generate a new token\n');
        break;
        
      case ErrorType.AUTH_LIMITS:
        console.error('\n❌ Usage Limits Reached: You have reached your plan limits.');
        console.error('Your current subscription plan does not allow additional usage at this time.');
        console.error('\nTo increase your limits:');
        console.error('  1. Visit https://console.easymcp.net/subscription');
        console.error('  2. Upgrade to a higher tier plan with increased limits');
        console.error('  3. Contact support if you need a custom plan\n');
        break;
        
      case ErrorType.AUTH_INVALID:
        console.error('\n❌ Invalid Token: Your authentication token was rejected.');
        console.error('This token is not recognized by the EasyMCP server.');
        console.error('\nTo fix this issue:');
        console.error('  1. Check that you copied the token correctly');
        console.error('  2. Generate a new token at https://console.easymcp.net/tokens');
        console.error('  3. Make sure you are using the correct environment (dev/prod)\n');
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