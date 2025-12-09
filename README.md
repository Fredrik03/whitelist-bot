# Whitelist Bot

Discord bot for whitelisting players on a Minecraft server via Pterodactyl API.

## Features

- `/whitelist <username>` slash command
- Username validation (3-16 characters, a-z A-Z 0-9 _)
- Support for Bedrock players (optional . prefix)
- SQLite database for tracking whitelisted players
- Pterodactyl API integration
- Duplicate detection
- Detailed error messages
- Ephemeral error messages (only visible to user)
- Public success/error embeds in configured channel
- Docker support with health checks
- Graceful shutdown handling

## Requirements

- Discord Bot Token
- Discord Application Client ID
- Pterodactyl Panel with Client API access
- Docker and Docker Compose (for deployment)

## Setup

### 1. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Enable "MESSAGE CONTENT INTENT" (if needed)
5. Copy the bot token
6. Copy the Application ID (Client ID)
7. Go to OAuth2 > URL Generator
8. Select scopes: `bot`, `applications.commands`
9. Select bot permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`
10. Use generated URL to invite bot to your server

### 2. Pterodactyl API Key

1. Log in to your Pterodactyl Panel
2. Go to Account Settings > API Credentials
3. Create a new API key with description "Whitelist Bot"
4. Copy the generated key
5. Find your Server ID (short UUID) in the server URL or settings

### 3. Configuration

1. Clone this repository
2. Navigate to the `bot` directory
3. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
4. Edit `.env` and fill in your values:
   ```env
   DISCORD_TOKEN=your_bot_token
   DISCORD_CLIENT_ID=your_application_client_id
   DISCORD_CHANNEL_ID=channel_id_for_confirmations
   PTERODACTYL_URL=https://panel.example.com
   PTERODACTYL_SERVER_ID=short_uuid
   PTERODACTYL_API_KEY=ptlc_your_api_key
   ```

### 4. Deployment

#### Using Docker Compose (Recommended)

```bash
# Build and start the bot
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the bot
docker-compose down

# Rebuild after code changes
docker-compose up -d --build
```

#### Using Docker directly

```bash
# Build image
docker build -t whitelist-bot .

# Run container
docker run -d \
  --name whitelist-bot \
  --restart unless-stopped \
  --env-file .env \
  -v $(pwd)/data:/data \
  whitelist-bot

# View logs
docker logs -f whitelist-bot
```

### 5. Unraid Setup

1. Go to Docker tab
2. Click "Add Container"
3. Configure:
   - Name: `whitelist-bot`
   - Repository: Build from local path or use image
   - Network Type: `Bridge`
4. Add environment variables from `.env`
5. Add volume mapping: `/mnt/user/appdata/whitelist-bot/data` -> `/data`
6. Set restart policy to `unless-stopped`
7. Apply and start

## Usage

### Whitelist Command

```
/whitelist Player123
```

The bot will:
1. Validate the username
2. Check if already whitelisted
3. Send command to Pterodactyl
4. Save to database on success
5. Send confirmation embed in channel

### Valid Usernames

- 3-16 characters
- Letters (a-z, A-Z)
- Numbers (0-9)
- Underscore (_)
- Optional dot (.) at the start for Bedrock players

Examples:
- `Player123` ✅
- `Steve_MC` ✅
- `.BedrockPlayer` ✅
- `AB` ❌ (too short)
- `Player-123` ❌ (invalid character)

## Database

The bot stores whitelisted players in SQLite database at `/data/whitelist.db`.

### Schema

```sql
CREATE TABLE whitelist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  added_by_discord_id TEXT NOT NULL,
  added_by_discord_username TEXT NOT NULL
);
```

### Backup

The database is stored in the `data` directory (mapped volume). To backup:

```bash
cp data/whitelist.db data/whitelist.db.backup
```

## Error Handling

The bot handles various error scenarios:

- **Invalid username**: Ephemeral error message to user
- **Already whitelisted**: Ephemeral warning with date
- **Server offline (412)**: Public error embed
- **Access denied (403)**: Public error embed (check API key)
- **Timeout**: Public error embed
- **Database error**: Logged and generic error to user

## Logging

All operations are logged with timestamps:

```
[2024-01-15 14:30:45] INFO: Bot logged in as WhitelistBot#1234
[2024-01-15 14:31:02] INFO: Whitelist command received for Player123 by User#5678
[2024-01-15 14:31:03] INFO: Successfully whitelisted Player123 on Pterodactyl
[2024-01-15 14:31:03] INFO: Added Player123 to database (by User#5678)
```

## Development

### Local Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Run production build
npm start
```

### Project Structure

```
bot/
├── src/
│   ├── index.ts          # Main bot file
│   ├── database.ts       # SQLite operations
│   ├── pterodactyl.ts    # API calls
│   ├── validators.ts     # Username validation
│   └── utils.ts          # Logging and formatting
├── data/                 # SQLite database (volume)
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Troubleshooting

### Bot not responding to slash commands

1. Check bot is online: `docker logs whitelist-bot`
2. Verify bot has correct permissions in Discord server
3. Slash commands can take up to 1 hour to register globally
4. Try removing and re-inviting the bot

### Pterodactyl errors

- **412 Error**: Server is offline, start the Minecraft server first
- **403 Error**: Invalid or expired API key, create new one
- **Timeout**: Server not responding, check Pterodactyl panel status

### Database errors

1. Check `/data` directory exists and has correct permissions
2. Verify SQLite database is not corrupted:
   ```bash
   docker exec -it whitelist-bot sqlite3 /data/whitelist.db "PRAGMA integrity_check;"
   ```

## License

MIT License

## Support

For issues and questions, please open an issue on GitHub.
