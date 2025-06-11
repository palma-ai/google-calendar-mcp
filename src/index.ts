#!/usr/bin/env node

import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { mcpAuthMetadataRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { Request, Response } from "express";
import { createOAuth2Client } from './auth/client.js';
import { getToolDefinitions } from './handlers/listTools.js';
import { handleCallTool } from './handlers/callTool.js';

// Server factory function
function getServer(): Server {
  const server = new Server(
    {
      name: "google-calendar",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return getToolDefinitions();
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, { authInfo }) => {
    if (!authInfo) {
      return {
        content: [
          {
            type: "text",
            text: "Error: Authentication required. Please provide valid authInfo.",
          },
        ],
      };
    }

    // Create OAuth2Client with the token from authInfo
    const oauth2Client = createOAuth2Client(authInfo.token, authInfo.expiresAt);
    return handleCallTool(request, oauth2Client);
  });

  return server;
}

// Express server setup
const app = express();
app.use(express.json());

// Get server configuration from environment variables
const SERVER_PORT = process.env.PORT || 3011;
const SERVER_HOST = process.env.SERVER_HOST || "localhost";

// Google OAuth 2.0 endpoints and metadata
const googleOAuthMetadata = {
  issuer: "https://accounts.google.com",
  authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  token_endpoint: "https://oauth2.googleapis.com/token",
  userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo",
  revocation_endpoint: "https://oauth2.googleapis.com/revoke",
  jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
  response_types_supported: ["code"],
  subject_types_supported: ["public"],
  id_token_signing_alg_values_supported: ["RS256"],
  scopes_supported: [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.settings.readonly",
  ],
  token_endpoint_auth_methods_supported: [
    "client_secret_basic",
    "client_secret_post",
  ],
  claims_supported: [
    "aud",
    "email",
    "email_verified",
    "exp",
    "family_name",
    "given_name",
    "iat",
    "iss",
    "locale",
    "name",
    "picture",
    "sub",
  ],
  code_challenge_methods_supported: ["S256"],
  grant_types_supported: ["authorization_code", "refresh_token"],
};

// Set up OAuth metadata routes - points clients to Google's OAuth servers
const resourceServerUrl = new URL(`http://${SERVER_HOST}:${SERVER_PORT}`);
app.use(
  mcpAuthMetadataRouter({
    oauthMetadata: googleOAuthMetadata,
    resourceServerUrl,
    scopesSupported: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.settings.readonly",
    ],
    resourceName: "Google Calendar MCP Server",
  })
);

// Middleware to handle bearer token authentication with Google token verification
const tokenMiddleware = requireBearerAuth({
  requiredScopes: ["https://www.googleapis.com/auth/calendar"],
  verifier: {
    verifyAccessToken: async (token: string): Promise<AuthInfo> => {
      // Use Google's tokeninfo endpoint to verify the token
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${token}`
      );

      // Important: IF not MCP client will not refresh tokens
      if (!response.ok && [400, 401].includes(response.status)) {
        throw new InvalidTokenError("Invalid token");
      }

      if (!response.ok) {
        throw new InvalidTokenError(
          `Token verification failed with status ${response.status}`
        );
      }

      const tokenInfo = await response.json();

      // Google's tokeninfo endpoint validates the token for us
      // No need to check client ID since we accept any valid Google token
      return {
        token,
        clientId: tokenInfo.aud || "google",
        scopes: tokenInfo.scope ? tokenInfo.scope.split(" ") : ["calendar"],
        expiresAt: tokenInfo.exp ? parseInt(tokenInfo.exp) : undefined,
      };
    },
  },
});

app.post("/mcp", tokenMiddleware, async (req: Request, res: Response) => {
  try {
    console.log("Creating server");
    const server = getServer();
    console.log("Creating transport");
    const transport: StreamableHTTPServerTransport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
    res.on("close", () => {
      console.log("Request closed");
      transport.close();
      server.close();
    });
    console.log("Connecting to server");
    await server.connect(transport);
    console.log("Request received", req.body);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

app.get("/mcp", async (req: Request, res: Response) => {
  console.log("Received GET MCP request");
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    })
  );
});

app.delete("/mcp", async (req: Request, res: Response) => {
  console.log("Received DELETE MCP request");
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed.",
      },
      id: null,
    })
  );
});

// Start the server
app.listen(SERVER_PORT, () => {
  console.log(
    `Google Calendar MCP Stateless Streamable HTTP Server listening on port ${SERVER_PORT}`
  );
  console.log(
    `OAuth Protected Resource Metadata: ${resourceServerUrl.origin}/.well-known/oauth-protected-resource`
  );
  console.log(
    `OAuth Authorization Server Metadata: ${resourceServerUrl.origin}/.well-known/oauth-authorization-server`
  );
  console.log(
    `Google OAuth Authorization Endpoint: ${googleOAuthMetadata.authorization_endpoint}`
  );
  console.log(
    `Google OAuth Token Endpoint: ${googleOAuthMetadata.token_endpoint}`
  );
  console.log("");
  console.log("Optional environment variables:");
  console.log("- PORT: Server port (default: 3011)");
  console.log("- SERVER_HOST: Server hostname (default: localhost)");
  console.log("");
  console.log("The MCP client will:");
  console.log("1. Discover metadata from your server");
  console.log("2. Be directed to Google's OAuth servers for authentication");
  console.log("3. Send Google access tokens to your server for API calls");
  console.log("");
  console.log(
    "Note: Google OAuth client credentials are configured in the MCP client, not this server."
  );
});
