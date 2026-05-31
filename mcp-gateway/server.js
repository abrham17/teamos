/**
 * TeamOS MCP HTTP Gateway
 * =======================
 * Bridges Django's MCPClient (HTTP) ↔ official MCP stdio servers.
 *
 * Each registered integration (github, slack, trello, notion, gdrive, gcalendar)
 * gets its own port. Django registers the gateway URL in MCPServerRegistration
 * and calls:
 *   POST /tools/list  → discover available tools
 *   POST /tools/call  → execute a tool
 *
 * The gateway spawns the underlying MCP stdio server process on first use,
 * keeps it alive, and serialises JSON-RPC messages over stdin/stdout.
 *
 * Usage:
 *   node server.js
 *
 * Environment variables (set in .env or docker-compose):
 *   GITHUB_TOKEN              GitHub Personal Access Token
 *   SLACK_BOT_TOKEN           Slack Bot OAuth token (xoxb-...)
 *   TRELLO_API_KEY            Trello API key
 *   TRELLO_TOKEN              Trello OAuth token
 *   NOTION_TOKEN              Notion integration token (secret_...)
 *   GOOGLE_CLIENT_ID          Google OAuth2 client ID
 *   GOOGLE_CLIENT_SECRET      Google OAuth2 client secret
 *   GOOGLE_REFRESH_TOKEN      Google OAuth2 refresh token
 *   GATEWAY_HOST              Host to bind (default: 0.0.0.0)
 *   GATEWAY_AUTH_TOKEN        Shared secret Django sends as Bearer token (optional)
 */

"use strict";

const express = require("express");
const { spawn } = require("child_process");
const { EventEmitter } = require("events");

// ── Configuration ────────────────────────────────────────────────────────────

const HOST = process.env.GATEWAY_HOST || "0.0.0.0";
const AUTH_TOKEN = process.env.GATEWAY_AUTH_TOKEN || null; // optional shared secret

/**
 * Each entry maps a gateway key to:
 *   port    – the TCP port this integration listens on
 *   cmd     – the command to spawn the MCP stdio server
 *   args    – arguments passed to cmd
 *   env     – extra environment variables for the child process
 */
const INTEGRATIONS = {
  github: {
    port: 9091,
    cmd: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN || "",
    },
  },
  slack: {
    port: 9092,
    cmd: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: {
      SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN || "",
      SLACK_TEAM_ID: process.env.SLACK_TEAM_ID || "",
    },
  },
  trello: {
    port: 9093,
    cmd: "npx",
    args: ["-y", "trello-mcp-server"],
    env: {
      TRELLO_API_KEY: process.env.TRELLO_API_KEY || "",
      TRELLO_TOKEN: process.env.TRELLO_TOKEN || "",
    },
  },
  notion: {
    port: 9094,
    cmd: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    env: {
      OPENAPI_MCP_HEADERS: JSON.stringify({
        Authorization: `Bearer ${process.env.NOTION_TOKEN || ""}`,
        "Notion-Version": "2022-06-28",
      }),
    },
  },
  gdrive: {
    port: 9095,
    cmd: "npx",
    args: ["-y", "@modelcontextprotocol/server-gdrive"],
    env: {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
      GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN || "",
    },
  },
  gcalendar: {
    port: 9096,
    cmd: "npx",
    args: ["-y", "@cocal/google-calendar-mcp"],
    env: {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
      GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN || "",
    },
  },
};

// ── MCP Stdio Client ─────────────────────────────────────────────────────────

/**
 * Wraps a spawned MCP stdio process and exposes a request/response API.
 * MCP uses newline-delimited JSON-RPC 2.0 over stdin/stdout.
 */
class MCPProcess extends EventEmitter {
  constructor(key, config) {
    super();
    this.key = key;
    this.config = config;
    this.process = null;
    this.buffer = "";
    this.pending = new Map(); // id → { resolve, reject, timer }
    this._nextId = 1;
    this._starting = false;
    this._ready = false;
  }

  async ensureStarted() {
    if (this._ready) return;
    if (this._starting) {
      // Wait for ready event
      await new Promise((res, rej) => {
        this.once("ready", res);
        this.once("error", rej);
      });
      return;
    }
    this._starting = true;

    const childEnv = { ...process.env, ...this.config.env };

    console.log(`[${this.key}] Spawning: ${this.config.cmd} ${this.config.args.join(" ")}`);
    this.process = spawn(this.config.cmd, this.config.args, {
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout.on("data", (chunk) => this._onData(chunk));
    this.process.stderr.on("data", (d) => {
      // MCP servers write logs to stderr — surface at debug level
      process.stderr.write(`[${this.key}] ${d}`);
    });
    this.process.on("exit", (code) => {
      console.warn(`[${this.key}] Process exited with code ${code}. Will restart on next call.`);
      this._ready = false;
      this._starting = false;
      this.process = null;
      // Reject all pending requests
      for (const [, { reject, timer }] of this.pending) {
        clearTimeout(timer);
        reject(new Error(`MCP process for '${this.key}' exited unexpectedly`));
      }
      this.pending.clear();
    });

    // Send MCP initialize handshake
    try {
      await this._sendRequest("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "teamos-gateway", version: "1.0.0" },
      });
      // Send initialized notification (no response expected)
      this._sendNotification("notifications/initialized");
      this._ready = true;
      this._starting = false;
      console.log(`[${this.key}] MCP server ready`);
      this.emit("ready");
    } catch (err) {
      this._starting = false;
      this.emit("error", err);
      throw err;
    }
  }

  _onData(chunk) {
    this.buffer += chunk.toString();
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop(); // last partial line stays buffered
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const { resolve, reject, timer } = this.pending.get(msg.id);
        clearTimeout(timer);
        this.pending.delete(msg.id);
        if (msg.error) {
          reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          resolve(msg.result);
        }
      }
    }
  }

  _sendRaw(obj) {
    const line = JSON.stringify(obj) + "\n";
    this.process.stdin.write(line);
  }

  _sendNotification(method, params = {}) {
    this._sendRaw({ jsonrpc: "2.0", method, params });
  }

  _sendRequest(method, params = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const id = this._nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request '${method}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this._sendRaw({ jsonrpc: "2.0", id, method, params });
    });
  }

  async listTools() {
    await this.ensureStarted();
    const result = await this._sendRequest("tools/list");
    return result?.tools || [];
  }

  async callTool(name, args) {
    await this.ensureStarted();
    const result = await this._sendRequest("tools/call", {
      name,
      arguments: args,
    });
    return result;
  }

  destroy() {
    if (this.process) {
      this.process.kill("SIGTERM");
    }
  }
}

// ── Per-integration process registry ────────────────────────────────────────

const processes = {};

function getProcess(key) {
  if (!processes[key]) {
    processes[key] = new MCPProcess(key, INTEGRATIONS[key]);
  }
  return processes[key];
}

// ── Express app factory ──────────────────────────────────────────────────────

function buildApp(key) {
  const app = express();
  app.use(express.json());

  // Optional auth middleware
  app.use((req, res, next) => {
    if (!AUTH_TOKEN) return next();
    const header = req.headers["authorization"] || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (token !== AUTH_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  });

  // Health check
  app.get("/health", (req, res) => {
    res.json({ ok: true, integration: key });
  });

  /**
   * POST /tools/list
   * Returns tool schemas in MCP format.
   * Django MCPClient calls this to discover available tools.
   */
  app.post("/tools/list", async (req, res) => {
    try {
      const proc = getProcess(key);
      const tools = await proc.listTools();
      res.json({ tools });
    } catch (err) {
      console.error(`[${key}] tools/list error:`, err.message);
      res.status(502).json({
        error: err.message,
        hint: `Check that the '${key}' MCP server package is installed and credentials are set in .env`,
      });
    }
  });

  /**
   * POST /tools/call
   * Executes a tool call.
   * Django MCPClient calls this when the agent invokes an mcp_<key>_<tool> function.
   *
   * Body: { method: "tools/call", params: { name: "...", arguments: {...} } }
   */
  app.post("/tools/call", async (req, res) => {
    const { params } = req.body || {};
    const toolName = params?.name;
    const args = params?.arguments || {};

    if (!toolName) {
      return res.status(400).json({ error: "params.name is required" });
    }

    try {
      const proc = getProcess(key);
      const result = await proc.callTool(toolName, args);

      // Normalise to MCP content format
      const content = result?.content || [{ type: "text", text: JSON.stringify(result) }];
      res.json({
        content,
        isError: result?.isError || false,
      });
    } catch (err) {
      console.error(`[${key}] tools/call '${toolName}' error:`, err.message);
      res.status(502).json({
        content: [{ type: "text", text: err.message }],
        isError: true,
      });
    }
  });

  return app;
}

// ── Start all integration servers ────────────────────────────────────────────

async function startAll() {
  const enabledKeys = Object.keys(INTEGRATIONS).filter((key) => {
    // Only start integrations that have at least one credential set
    const env = INTEGRATIONS[key].env;
    return Object.values(env).some((v) => v && v.length > 0);
  });

  if (enabledKeys.length === 0) {
    console.warn(
      "⚠️  No credentials found in environment. Set GITHUB_TOKEN, SLACK_BOT_TOKEN, etc. to enable integrations."
    );
    console.log("Starting health-check-only servers for all integrations...");
  }

  // Always start all servers (so health checks work and Django can reach them)
  for (const [key, config] of Object.entries(INTEGRATIONS)) {
    const app = buildApp(key);
    app.listen(config.port, HOST, () => {
      const hasCredentials = Object.values(config.env).some((v) => v && v.length > 0);
      const status = hasCredentials ? "✅ credentials set" : "⚠️  no credentials (sync will fail)";
      console.log(`[${key}] HTTP gateway on ${HOST}:${config.port}  ${status}`);
    });
  }
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown() {
  console.log("\nShutting down MCP gateway...");
  for (const [key, proc] of Object.entries(processes)) {
    console.log(`  Terminating ${key} process`);
    proc.destroy();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ── Main ──────────────────────────────────────────────────────────────────────

startAll().catch((err) => {
  console.error("Fatal gateway startup error:", err);
  process.exit(1);
});
