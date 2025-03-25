# EasyMCP

The simplest way to connect Claude Desktop and Cursor to external tools and services using MCP (Model Context Protocol) servers.

## What is EasyMCP?

EasyMCP is a turnkey solution that lets Claude Desktop and Cursor access external tools and APIs with zero configuration that you have to do.

## Why Use EasyMCP?

- **Simple**: One command to install, no client configuration required
- **Configurable**: Choose the services and functions you want to use
- **Secure**: Credentials stored securely in the cloud
- **Expandable**: New tools and integrations added regularly
- **Reliable**: Professionally maintained infrastructure

## Getting Started

1. Go to [easymcp.net](https://easymcp.net) to get your token and pick your services
2. Just add this config to Claude Desktop and/or Cursor:

```json
{
    "mcpServers": {
      "EasyMCP.net": {
        "command": "npx",
        "args": ["@easymcp/easymcp"],
        "env": {
          "EASYMCP_TOKEN": "YOUR_TOKEN"
        }
      }
    }
}
```

That's it! Claude Desktop and Cursor will now have access to all services included in your plan.

## Compatibility

EasyMCP works with systems that support the Model Context Protocol (MCP):

- **Claude Desktop**: The official desktop application from Anthropic
- **Cursor**: An AI-powered code editor with Claude integration

As more applications adopt MCP, EasyMCP will be compatible with them as well.

## How It Works

EasyMCP acts as a bridge between Claude Desktop and our secure cloud infrastructure running several MCP servers. When Claude needs to use a tool, the request is securely forwarded to our servers where the actual processing happens.

### Customizable Tool Access

EasyMCP gives you granular control over which tools Claude can access. For each third-party integration, you can:

- Pick specific 3rd party services you want to integrate with
- Enable only the specific functions you want to use
- Control read/write permissions independently (e.g., allow reading emails but not sending them)
- Manage authentication for each service separately


## Plans and Pricing

Visit [easymcp.net](https://easymcp.net) to see available plans and pricing.

## Support

Need help? Visit [easymcp.net/support](https://easymcp.net/support)

## License

MIT
