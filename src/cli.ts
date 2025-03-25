#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { startMcpShim } from './index.js';

/**
 * EasyMCP CLI - A tool for connecting Claude Desktop to your services
 * 
 * Usage: 
 *   npx @easymcp/easymcp --token=YOUR_TOKEN [--debug]
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
  .help()
  .alias('help', 'h')
  .parseSync();

// Mask token in logs for security
const maskedToken = maskToken(argv.token);
console.error(`Starting EasyMCP with token: ${maskedToken} (${argv.debug ? 'debug mode' : 'normal mode'})`);

// Start the MCP shim
startMcpShim({
  token: argv.token,
  debug: argv.debug
}).catch(error => {
  console.error('Error running MCP shim:', error);
  process.exit(1);
});

// Utility function to mask tokens in logs
function maskToken(token: string): string {
  if (token.length <= 4) return '*'.repeat(token.length);
  return token.slice(0, 4) + '*'.repeat(Math.max(0, token.length - 4));
} 