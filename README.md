# EasyMCP

A lightweight MCP (Model Context Protocol) shim for Claude Desktop that connects to a hosted MCP server.

## Usage

EasyMCP is designed to be used directly via `npx` without installation:

```bash
npx easymcp --token=YOUR_TOKEN
```

## Configuration

To configure Claude Desktop to use EasyMCP, add the following to your Claude Desktop config:

```json
{
  "mcpServers": {
    "easymcp": {
      "command": "npx",
      "args": ["easymcp", "--token=YOUR_TOKEN"]
    }
  }
}
```

Replace `YOUR_TOKEN` with the token provided by the EasyMCP service.

## Features

- Securely connects Claude Desktop to a hosted MCP server
- Provides access to personalized AI tools based on your connected services
- Minimal local footprint - runs on demand via npx
- All sensitive logic and credentials are stored securely on the server

## Options

- `--token`: (Required) Your authentication token
- `--debug`: (Optional) Enable debug logging

## Example

```bash
npx easymcp --token=abc123 --debug
```

## License

All rights reserved. This software is proprietary and may not be copied, modified, or distributed without authorization.
