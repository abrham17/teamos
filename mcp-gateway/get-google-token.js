#!/usr/bin/env node
/**
 * get-google-token.js
 * ────────────────────
 * One-time helper to get a Google OAuth2 refresh token for Drive & Calendar.
 *
 * Usage:
 *   node get-google-token.js
 *
 * Prerequisites:
 *   1. Create OAuth 2.0 credentials at https://console.cloud.google.com/apis/credentials
 *      Type: Desktop app
 *   2. Enable APIs:
 *      - Google Drive API
 *      - Google Calendar API
 *   3. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env
 *      (or export them before running this script)
 *
 * The script will:
 *   1. Print an authorization URL — open it in your browser
 *   2. Prompt you to paste the code from the redirect URL
 *   3. Exchange it for tokens and print GOOGLE_REFRESH_TOKEN
 *   4. Paste that value into your .env
 */

"use strict";

const https = require("https");
const readline = require("readline");
const { URLSearchParams } = require("url");

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌  Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment first.");
  console.error("   Example:");
  console.error("   export GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com");
  console.error("   export GOOGLE_CLIENT_SECRET=GOCSPX-...");
  process.exit(1);
}

const REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob"; // manual copy-paste flow
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/calendar",
].join(" ");

const authUrl =
  `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&access_type=offline` +
  `&prompt=consent`;

console.log("\n╔══════════════════════════════════════════════════════╗");
console.log("║       TeamOS — Google OAuth2 Token Helper            ║");
console.log("╚══════════════════════════════════════════════════════╝\n");
console.log("Step 1: Open this URL in your browser:\n");
console.log("  " + authUrl + "\n");
console.log("Step 2: Grant access to your Google account.");
console.log("Step 3: Copy the authorization code shown on screen.\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question("Paste the authorization code here: ", async (code) => {
  rl.close();
  code = code.trim();
  if (!code) {
    console.error("❌  No code provided.");
    process.exit(1);
  }

  // Exchange code for tokens
  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  }).toString();

  const req = https.request(
    {
      hostname: "oauth2.googleapis.com",
      path: "/token",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            console.error(`\n❌  Token exchange failed: ${json.error_description || json.error}`);
            process.exit(1);
          }
          console.log("\n✅  Success! Add these to your mcp-gateway/.env:\n");
          console.log(`GOOGLE_REFRESH_TOKEN=${json.refresh_token}`);
          console.log("\n(Your access_token expires in 1 hour but the refresh_token is permanent.)\n");
        } catch {
          console.error("❌  Failed to parse Google response:", data);
          process.exit(1);
        }
      });
    }
  );

  req.on("error", (err) => {
    console.error("❌  Request failed:", err.message);
    process.exit(1);
  });

  req.write(body);
  req.end();
});
