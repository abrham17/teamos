FROM node:20-alpine

WORKDIR /app

# Install wget for healthcheck
RUN apk add --no-cache wget

# Copy package files and install Express
COPY package.json ./
RUN npm install --omit=dev

# Pre-cache the MCP stdio server packages so npx doesn't download them at runtime.
# Uses --prefer-offline after caching; failures are non-fatal (tolerated with || true).
RUN npx --yes @modelcontextprotocol/server-github --help 2>/dev/null || true
RUN npx --yes @modelcontextprotocol/server-slack --help 2>/dev/null || true
RUN npx --yes trello-mcp-server --help 2>/dev/null || true
RUN npx --yes @notionhq/notion-mcp-server --help 2>/dev/null || true
RUN npx --yes @modelcontextprotocol/server-gdrive --help 2>/dev/null || true
RUN npx --yes @cocal/google-calendar-mcp --help 2>/dev/null || true

# Copy gateway source
COPY server.js ./

EXPOSE 9091 9092 9093 9094 9095 9096

CMD ["node", "server.js"]

