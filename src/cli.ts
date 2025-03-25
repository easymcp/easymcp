#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { startMcpShim } from './index.js';

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('token', {
    alias: 't',
    type: 'string',
    description: 'API token for authentication',
    default: 'test-token'
  })
  .option('server', {
    alias: 's',
    type: 'string',
    description: 'API server URL',
    default: 'http://localhost:3000'
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

console.error(`Starting EasyMCP shim with options:
- Server: ${argv.server}
- Debug: ${argv.debug ? 'enabled' : 'disabled'}
- Token: ${argv.token.slice(0, 3)}${'*'.repeat(Math.max(0, argv.token.length - 3))}
`);

// Start the MCP shim
startMcpShim({
  token: argv.token,
  server: argv.server,
  debug: argv.debug
}).catch(error => {
  console.error('Error running MCP shim:', error);
  process.exit(1);
});

// Add this to keep the Node.js event loop busy
process.stdin.resume();
console.error("CLI started, process should stay alive"); 