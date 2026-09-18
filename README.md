# StreamParty

Ultra-low latency (<200ms) screen-sharing and voice-chat platform for streaming desktop, application windows, and browser tabs with synchronized computer audio and live text messaging.

Built with React 18, Mantine 8, Socket.IO, and WebRTC. Styled in Void Black (`#08080a`) & Electric Crimson (`#ff2e4c`) with Google Fonts **Fira Code** monospaced typography.

---

## Features

- **Direct Screen & Audio Streaming**: Share any monitor, application window, or browser tab with full stereo audio via browser WebRTC (`getDisplayMedia`) with sub-200ms latency.
- **Microphone-Only Voice Chat**: Multi-party WebRTC audio mesh with built-in echo cancellation, noise suppression, mic mute/unmute toggles, and pulsating speaking indicators.
- **Integrated Live Text Chat**: Sidebar text chat with message replies, emoji reactions, and timestamp tracking in monospaced terminal styling.
- **Zero-Login & Private by Default**: No accounts, no passwords, no email signups, and no tracking. Creating a room generates an unlisted, private URL (e.g., `/watch/swift-falcon-glide`). Anyone with the direct link joins instantly.
- **Self-Contained & In-Memory**: Zero database dependencies. Runs without PostgreSQL, Redis, Firebase, or cloud VMs.
- **Minimal Resource Footprint**: Lean multi-stage Docker container (~180MB image) with memory limits under 512MB, ideal for running alongside other services on a VPS (such as AWS Lightsail).

---

## Architecture Overview

```
[ Host / Streamer ] <======= P2P WebRTC Video & Audio Mesh =======> [ Viewers / Listeners ]
        |                                                                     |
        +-----> Signaling JSON via WebSocket (Node.js 22 + Socket.IO) <-------+
                                        |
                         [ Nginx Reverse Proxy (SSL) ]
                                        |
                          [ Public Web (Subdomain) ]
```

- **Video & Voice**: Transmitted Peer-to-Peer directly between participants using encrypted WebRTC UDP/SRTP streams.
- **Signaling Hub**: Node.js backend handles lightweight JSON session descriptions (SDP) and ICE candidate exchanges (~50KB per session).
- **Static Assets**: Compiled React SPA bundle is served directly by the Express backend.

---

## Quick Start (Docker)

### 1. Prerequisites
- Docker and Docker Compose installed on your machine or server.

### 2. Configure Environment
Copy the example environment file:
```bash
cp .env.example .env
```
Default configuration:
```env
PORT=8080
HOST=0.0.0.0
NODE_ENV=production
```

### 3. Build & Run
```bash
docker compose up -d --build
```
Access the application at `http://localhost:8080`.

---

## Production Deployment (AWS Lightsail / VPS)

The app binds internally to `127.0.0.1:8080` so that your host's Nginx handles public SSL termination and existing services (such as blogs on port 80/443 or DNS resolvers on port 53) remain completely undisturbed.

### 1. Configure DNS
Create an `A` record pointing your chosen subdomain (e.g., `stream.yourdomain.com`) to your server's public IP address.

### 2. Configure Nginx
Use the provided `nginx.sample.conf`:
```bash
# Copy sample configuration
sudo cp nginx.sample.conf /etc/nginx/sites-available/stream.conf

# Replace placeholder with your actual domain
sudo sed -i 's/stream.yourdomain.com/stream.YOUR_DOMAIN.com/g' /etc/nginx/sites-available/stream.conf

# Enable virtual host
sudo ln -sf /etc/nginx/sites-available/stream.conf /etc/nginx/sites-enabled/

# Issue free SSL certificate via Let's Encrypt Certbot
sudo certbot --nginx -d stream.YOUR_DOMAIN.com

# Test and reload Nginx
sudo nginx -t && sudo systemctl reload nginx
```

### 3. Start Container
In the project directory:
```bash
docker compose up -d --build
```

---

## Local Development (Without Docker)

```bash
# 1. Install dependencies
npm install

# 2. Build frontend and verify TypeScript
npm run build

# 3. Start server
npm start
```

---

## License

MIT License. See [LICENSE](LICENSE) for details.
