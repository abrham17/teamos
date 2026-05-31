# TeamOS MCP HTTP Gateway

Bridges the TeamOS Django backend ↔ official MCP stdio tool servers over HTTP.

## How It Works

```
Django Agent
     │ POST /tools/list
     │ POST /tools/call
     ▼
MCP Gateway (Express, port 909x)
     │ JSON-RPC 2.0 over stdin/stdout
     ▼
MCP stdio server (@modelcontextprotocol/server-github, etc.)
     │ GitHub / Slack / Trello / Notion / Google APIs
     ▼
External Service
```

The gateway spawns each MCP stdio server process on first use and keeps it alive. All JSON-RPC messages are serialised over the child process's stdin/stdout. The HTTP interface matches what Django's `MCPClient` expects.

## Ports

| Integration    | Port |
|----------------|------|
| GitHub         | 9091 |
| Slack          | 9092 |
| Trello         | 9093 |
| Notion         | 9094 |
| Google Drive   | 9095 |
| Google Calendar| 9096 |

## Local Setup

```bash
cd mcp-gateway
cp .env.example .env
# Edit .env and add your API tokens (only the services you want to use)

chmod +x start-local.sh
./start-local.sh
```

Then in TeamOS Settings → Integrations, register each server:

| Name       | Gateway URL               |
|------------|---------------------------|
| github     | http://localhost:9091     |
| slack      | http://localhost:9092     |
| trello     | http://localhost:9093     |
| notion     | http://localhost:9094     |
| gdrive     | http://localhost:9095     |
| gcalendar  | http://localhost:9096     |

Click **Sync** on each card to discover its tools.

## Docker (via docker-compose)

```bash
# From the repo root:
cp mcp-gateway/.env.example mcp-gateway/.env
# Edit mcp-gateway/.env

docker-compose up mcp-gateway
```

The gateway is already declared in `docker-compose.yml`. The backend will reach it at `http://mcp-gateway:<port>`.

## Getting API Tokens

### GitHub
1. Go to <https://github.com/settings/tokens>
2. Create a Fine-grained PAT with: `Contents`, `Issues`, `Pull requests` read permissions
3. Set `GITHUB_TOKEN=ghp_...` in `.env`

### Slack
1. Go to <https://api.slack.com/apps> → Create App → From scratch
2. Add OAuth scopes: `channels:history`, `channels:read`, `chat:write`, `users:read`
3. Install to workspace → copy **Bot User OAuth Token**
4. Set `SLACK_BOT_TOKEN=xoxb-...` and `SLACK_TEAM_ID=T...` in `.env`

### Trello
1. Go to <https://trello.com/app-key>
2. Copy your **API Key** and generate a **Token**
3. Set `TRELLO_API_KEY=...` and `TRELLO_TOKEN=...` in `.env`

### Notion
1. Go to <https://www.notion.so/my-integrations> → New integration
2. Copy the **Internal Integration Token** (`secret_...`)
3. Share the pages/databases you want accessible with the integration
4. Set `NOTION_TOKEN=secret_...` in `.env`

### Google Drive & Calendar
1. Go to <https://console.cloud.google.com/apis/credentials>
2. Create an **OAuth 2.0 Client ID** (Desktop app)
3. Enable **Google Drive API** and **Google Calendar API**
4. Run the OAuth flow to get a refresh token (use the Google OAuth Playground or a helper script)
5. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` in `.env`

## Health Check

```bash
curl http://localhost:9091/health
# {"ok":true,"integration":"github"}
```
