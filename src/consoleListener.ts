import WebSocket from 'ws';
import axios from 'axios';
import { log } from './utils';

export interface ConsoleListenerConfig {
  url: string;
  serverId: string;
  apiKey: string;
}

export interface ConsoleMessage {
  event: string;
  args: string[];
}

type ConsoleCallback = (message: string) => void;

/**
 * Manages WebSocket connection to Pterodactyl console for real-time output
 */
export class ConsoleListener {
  private config: ConsoleListenerConfig;
  private ws: WebSocket | null = null;
  private callbacks: Map<string, ConsoleCallback> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private tokenRefreshTimer: NodeJS.Timeout | null = null;
  private authenticated = false;

  constructor(config: ConsoleListenerConfig) {
    this.config = config;
  }

  /**
   * Get WebSocket authentication token from Pterodactyl API
   */
  private async getWebSocketToken(): Promise<{ token: string; socket: string }> {
    const endpoint = `${this.config.url}/api/client/servers/${this.config.serverId}/websocket`;

    try {
      const response = await axios.get(endpoint, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Accept': 'Application/vnd.pterodactyl.v1+json',
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.data?.data) {
        return {
          token: response.data.data.token,
          socket: response.data.data.socket
        };
      }

      throw new Error('Invalid WebSocket token response');
    } catch (error: any) {
      log('ERROR', `Failed to get WebSocket token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Connect to Pterodactyl WebSocket
   */
  public async connect(): Promise<void> {
    try {
      const { token, socket } = await this.getWebSocketToken();

      // Close existing connection if any
      if (this.ws) {
        this.ws.close();
      }

      this.ws = new WebSocket(socket, {
        headers: {
          'Origin': this.config.url
        }
      });

      this.ws.on('open', () => {
        log('INFO', 'WebSocket connection established');
        // Authenticate with the token
        this.send({ event: 'auth', args: [token] });
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message: ConsoleMessage = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          log('ERROR', `Failed to parse WebSocket message: ${error}`);
        }
      });

      this.ws.on('error', (error) => {
        log('ERROR', `WebSocket error: ${error.message}`);
      });

      this.ws.on('close', () => {
        log('WARN', 'WebSocket connection closed');
        this.authenticated = false;
        this.scheduleReconnect();
      });

    } catch (error: any) {
      log('ERROR', `Failed to connect to WebSocket: ${error.message}`);
      this.scheduleReconnect();
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: ConsoleMessage): void {
    switch (message.event) {
      case 'auth success':
        log('INFO', 'WebSocket authenticated successfully');
        this.authenticated = true;
        // Schedule token refresh (8 minutes, before 10min expiry)
        this.scheduleTokenRefresh();
        break;

      case 'token expiring':
        log('INFO', 'WebSocket token expiring, refreshing...');
        this.refreshToken();
        break;

      case 'token expired':
        log('WARN', 'WebSocket token expired');
        this.reconnect();
        break;

      case 'console output':
        // Process console output
        if (message.args && message.args.length > 0) {
          const output = message.args[0];
          this.processConsoleOutput(output);
        }
        break;

      case 'status':
        log('INFO', `Server status: ${message.args[0]}`);
        break;

      case 'stats':
        // Server stats update
        break;

      default:
        // log('DEBUG', `Unhandled WebSocket event: ${message.event}`);
        break;
    }
  }

  /**
   * Process console output and trigger callbacks
   */
  private processConsoleOutput(output: string): void {
    // Trigger all registered callbacks
    this.callbacks.forEach((callback) => {
      callback(output);
    });
  }

  /**
   * Send a message to the WebSocket
   */
  private send(message: ConsoleMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      log('ERROR', 'Cannot send message: WebSocket not connected');
    }
  }

  /**
   * Send a command to the server console
   */
  public sendCommand(command: string): void {
    if (!this.authenticated) {
      log('ERROR', 'Cannot send command: Not authenticated');
      return;
    }

    this.send({ event: 'send command', args: [command] });
    log('INFO', `Sent command via WebSocket: ${command}`);
  }

  /**
   * Register a callback for console output
   * Returns a unique ID that can be used to unregister the callback
   */
  public onConsoleOutput(callback: ConsoleCallback): string {
    const id = Math.random().toString(36).substring(7);
    this.callbacks.set(id, callback);
    return id;
  }

  /**
   * Unregister a console output callback
   */
  public offConsoleOutput(id: string): void {
    this.callbacks.delete(id);
  }

  /**
   * Wait for a specific console message matching a pattern
   * Returns a promise that resolves when the message is found or rejects on timeout
   */
  public waitForConsoleMessage(pattern: RegExp, timeoutMs: number = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.offConsoleOutput(callbackId);
        reject(new Error('Timeout waiting for console message'));
      }, timeoutMs);

      const callbackId = this.onConsoleOutput((output) => {
        if (pattern.test(output)) {
          clearTimeout(timer);
          this.offConsoleOutput(callbackId);
          resolve(output);
        }
      });
    });
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      log('INFO', 'Attempting to reconnect WebSocket...');
      this.connect();
    }, 5000); // Retry after 5 seconds
  }

  /**
   * Schedule token refresh
   */
  private scheduleTokenRefresh(): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
    }

    // Refresh after 8 minutes (tokens last 10 minutes)
    this.tokenRefreshTimer = setTimeout(() => {
      this.refreshToken();
    }, 8 * 60 * 1000);
  }

  /**
   * Refresh the WebSocket token
   */
  private async refreshToken(): Promise<void> {
    try {
      const { token } = await this.getWebSocketToken();
      this.send({ event: 'auth', args: [token] });
      log('INFO', 'WebSocket token refreshed');
      this.scheduleTokenRefresh();
    } catch (error) {
      log('ERROR', `Failed to refresh token: ${error}`);
      this.reconnect();
    }
  }

  /**
   * Reconnect the WebSocket
   */
  private reconnect(): void {
    if (this.ws) {
      this.ws.close();
    }
    this.connect();
  }

  /**
   * Disconnect and cleanup
   */
  public disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.callbacks.clear();
    this.authenticated = false;
    log('INFO', 'Console listener disconnected');
  }

  /**
   * Check if WebSocket is connected and authenticated
   */
  public isConnected(): boolean {
    return this.authenticated && this.ws?.readyState === WebSocket.OPEN;
  }
}
