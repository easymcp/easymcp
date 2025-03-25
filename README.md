# EasyMCP

The simplest way to connect Claude Desktop and Cursor to external tools and services.

## What is EasyMCP?

EasyMCP is a turnkey solution that lets Claude Desktop and Cursor access external tools and APIs with zero configuration that you have to do.

## Why Use EasyMCP?

- **Simple**: One command to install, zero configuration required
- **Powerful**: Easy access to search, email, weather, and more tools
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

That's it! Claude Desktop and Cursor will now have access to all services included in your plan.

## Compatibility

EasyMCP works with systems that support the Model Context Protocol (MCP):

- **Claude Desktop**: The official desktop application from Anthropic
- **Cursor**: An AI-powered code editor with Claude integration

Currently, these are the only systems that support MCP servers. As more applications adopt MCP, EasyMCP will be compatible with them as well.

## How It Works

EasyMCP acts as a bridge between Claude Desktop and our secure cloud infrastructure running several MCP servers. When Claude needs to use a tool, the request is securely forwarded to our servers where the actual processing happens.

### Customizable Tool Access

EasyMCP gives you granular control over which tools Claude can access. For each third-party integration, you can:

- Enable only the specific functions you need
- Control read/write permissions independently (e.g., allow reading emails but not sending them)
- Set usage limits for specific tools
- Manage authentication for each service separately

This flexibility ensures Claude has access to exactly the tools you want - nothing more, nothing less.

## Plans and Pricing

Visit [easymcp.net](https://easymcp.net) to see available plans and pricing.

## Support

Need help? Visit [easymcp.net/support](https://easymcp.net/support)

## License

All rights reserved. This software is proprietary and may not be copied, modified, or distributed without authorization.
