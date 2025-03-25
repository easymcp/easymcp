#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { startMcpShim } from './index.js';

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('token', {
    description: 'Authentication token for the hosted MCP server',
    type: 'string',
    demandOption: true
  })
  .option('debug', {
    description: 'Enable debug logging',
    type: 'boolean',
    default: false
  })
  .help()
  .parseSync();

// Start the MCP shim
startMcpShim({
  token: argv.token,
  debug: argv.debug
}).catch(err => {
  console.error(`Fatal error: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});

// Add this to keep the Node.js event loop busy
process.stdin.resume();
console.error("CLI started, process should stay alive"); 