# EasyMCP

The simplest way to connect Claude Desktop and Cursor to external tools and services.

## What is EasyMCP?

EasyMCP is a turnkey solution that lets Claude Desktop access powerful external tools and APIs with zero configuration. Stop struggling with complex MCP server setup and get instant access to a growing library of tools.

## Why Use EasyMCP?

- **Simple**: One command to install, zero configuration required
- **Powerful**: Instant access to search, email, weather, and more tools
- **Secure**: Your credentials are stored securely in the cloud
- **Reliable**: Professionally maintained infrastructure
- **Expandable**: New tools and integrations added regularly

## Getting Started

1. Get your token at [easymcp.net](https://easymcp.net)
2. Add to Claude Desktop and/or Cursor in two simple steps:

```json
{
    "mcpServers": {
      "EasyMCP.net": {
        "type": "stdio",
        "command": "npx",
        "args": ["@easymcp/easymcp", "--token=YOUR_TOKEN"]
      }
    }
}
```

That's it! Claude will now have access to all services included in your plan.

## Benefits

- **Saves Time**: Skip the complicated setup of local MCP servers
- **Future-Proof**: Automatically updated with new tools and features
- **Cross-Platform**: Works on Windows, Mac, and Linux
- **Low Resource Usage**: Minimal local footprint

## How It Works

EasyMCP acts as a bridge between Claude Desktop and our secure cloud infrastructure. When Claude needs to use a tool, the request is securely forwarded to our servers where the actual processing happens.

## Plans and Pricing

Visit [easymcp.net](https://easymcp.net) to see available plans and pricing.

## Support

Need help? Visit [easymcp.net/support](https://easymcp.net/support)

## License

All rights reserved. This software is proprietary and may not be copied, modified, or distributed without authorization.
