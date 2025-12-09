# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create data directory for SQLite database
RUN mkdir -p /data && \
    chown -R node:node /data

# Use non-root user
USER node

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "const {Client,GatewayIntentBits}=require('discord.js');const c=new Client({intents:[GatewayIntentBits.Guilds]});c.on('ready',()=>{console.log('healthy');process.exit(0)});c.login(process.env.DISCORD_TOKEN).catch(()=>process.exit(1));setTimeout(()=>process.exit(1),5000);"

# Start the bot
CMD ["node", "dist/index.js"]
