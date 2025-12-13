# Minecraft Server Manager Bot

Discord bot for managing Minecraft servers: whitelist players and monitor real-time server status via Pterodactyl API.

## Features

### Whitelist Management
- `/whitelist <username>` slash command
- Username validation (3-16 characters, a-z A-Z 0-9 _)
- Support for Bedrock players (optional . prefix)
- SQLite database for tracking whitelisted players
- Pterodactyl API integration
- Duplicate detection
- Detailed error messages
- Ephemeral error messages (only visible to user)
- Public success/error embeds in configured channel

### Real-Time Server Status Monitor
- 🟢 **Live server status** - Online/Offline/Starting/Stopping indicators
- 👥 **Player tracking** - Shows player count and list of online players
- 💻 **Resource monitoring** - CPU usage, RAM usage, and uptime
- 🔄 **Auto-updating** - Status embed updates every 60 seconds
- 🎨 **Clean UI** - Color-coded Discord embeds with status emojis
- ⚙️ **Non-intrusive** - Updates a single message (no spam!)

### General
- Docker support with health checks
- Graceful shutdown handling
- Comprehensive error handling and logging

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
   # Required for whitelist functionality
   DISCORD_TOKEN=your_bot_token
   DISCORD_CLIENT_ID=your_application_client_id
   DISCORD_CHANNEL_ID=channel_id_for_confirmations
   PTERODACTYL_URL=https://panel.example.com
   PTERODACTYL_SERVER_ID=short_uuid
   PTERODACTYL_API_KEY=ptlc_your_api_key

   # Optional: Server status monitoring
   DISCORD_STATUS_CHANNEL_ID=channel_id_for_status_updates

   # Optional: Player tracking (requires enable-query=true in server.properties)
   MINECRAFT_SERVER_HOST=your.minecraft.server.com
   MINECRAFT_SERVER_PORT=25565
   ```

### 4. Deployment

#### Using Docker Compose on Unraid (Recommended)

The bot is automatically built and published to GitHub Container Registry. Simply use the provided `docker-compose.yml`:

1. Create a directory on your Unraid server:
   ```bash
   mkdir -p /mnt/user/appdata/whitelist-bot
   cd /mnt/user/appdata/whitelist-bot
   ```

2. Create a `.env` file with your configuration:
   ```env
   DISCORD_TOKEN=your_bot_token
   DISCORD_CLIENT_ID=your_application_client_id
   DISCORD_CHANNEL_ID=channel_id_for_confirmations
   DISCORD_STATUS_CHANNEL_ID=channel_id_for_status_updates
   PTERODACTYL_URL=https://panel.example.com
   PTERODACTYL_SERVER_ID=short_uuid
   PTERODACTYL_API_KEY=ptlc_your_api_key
   MINECRAFT_SERVER_HOST=your.minecraft.server.com
   MINECRAFT_SERVER_PORT=25565
   ```

3. Download the `docker-compose.yml` from this repository

4. Start the bot:
   ```bash
   docker-compose up -d
   ```

5. View logs:
   ```bash
   docker-compose logs -f whitelist-bot
   ```

The Docker image is automatically updated when changes are pushed to the master branch. The image is pulled from `ghcr.io/fredrik03/whitelist-bot:latest`.

#### Using Docker Compose Manager Plugin (Unraid)

If you have the Docker Compose Manager plugin installed on Unraid:

1. Navigate to the Docker Compose Manager in Unraid
2. Click "Add New Stack"
3. Name it `whitelist-bot`
4. Paste the contents of `docker-compose.yml`
5. Add your environment variables in the `.env` section
6. Click "Compose Up"

#### Manual Docker Setup

```bash
# Pull the latest image
docker pull ghcr.io/fredrik03/whitelist-bot:latest

# Run container
docker run -d \
  --name whitelist-bot \
  --restart unless-stopped \
  -e DISCORD_TOKEN=your_token \
  -e DISCORD_CLIENT_ID=your_client_id \
  -e DISCORD_CHANNEL_ID=your_channel_id \
  -e DISCORD_STATUS_CHANNEL_ID=your_status_channel_id \
  -e PTERODACTYL_URL=https://panel.example.com \
  -e PTERODACTYL_SERVER_ID=your_server_id \
  -e PTERODACTYL_API_KEY=your_api_key \
  -e MINECRAFT_SERVER_HOST=your.minecraft.server.com \
  -e MINECRAFT_SERVER_PORT=25565 \
  -e DB_PATH=/data/whitelist.db \
  -v /mnt/user/appdata/whitelist-bot/data:/data \
  ghcr.io/fredrik03/whitelist-bot:latest

# View logs
docker logs -f whitelist-bot
```

#### Building Locally (Development)

If you want to build the image locally instead of using the pre-built one:

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
```

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

### Server Status Monitor

When `DISCORD_STATUS_CHANNEL_ID` is configured, the bot automatically creates and updates a status embed in the specified channel.

**Status Information Displayed:**
- 🟢 **Status**: Server state (Online/Starting/Stopping/Offline)
- 👥 **Players**: Current player count (e.g., "5/20")
- 💻 **CPU**: CPU usage percentage
- 💾 **Memory**: RAM usage in MB and percentage
- ⏱️ **Uptime**: Server uptime in human-readable format
- 📋 **Online Players**: List of player names (up to 15 shown)

**How it works:**
- Updates every 60 seconds automatically
- Updates a single message (no spam!)
- Color-coded status: 🟢 Green (Online), 🟡 Yellow (Starting/Stopping), 🔴 Red (Offline)
- Automatically recreates message if manually deleted
- Shows "N/A" for players if Minecraft query is not configured

**Player Tracking Setup:**
For player names and count to work, add to your Minecraft server's `server.properties`:
```properties
enable-query=true
query.port=25565
```
Then restart your Minecraft server.

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
│   ├── pterodactyl.ts    # Pterodactyl API calls
│   ├── minecraftQuery.ts # Minecraft server query
│   ├── statusMonitor.ts  # Server status monitoring
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

### Status monitor not showing

1. Verify `DISCORD_STATUS_CHANNEL_ID` is set in your `.env` file
2. Check bot has permissions to send messages in the status channel
3. Check logs: `docker logs whitelist-bot`
4. Status monitor is optional - bot works fine without it

### Player tracking shows "N/A"

1. Ensure `MINECRAFT_SERVER_HOST` and `MINECRAFT_SERVER_PORT` are set
2. Add `enable-query=true` to your Minecraft server's `server.properties`
3. Restart your Minecraft server after changing server.properties
4. Verify the server host and port are correct
5. Player tracking is optional - status monitor works without it

## License

MIT License

## Support

For issues and questions, please open an issue on GitHub.
