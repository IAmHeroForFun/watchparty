# Comprehensive AWS Lightsail Hosting Guide
## Deploying StreamParty with Dockerized Nginx (Alongside Blog & Port 53 DNS)

---

### Overview

This guide walks you through deploying **StreamParty** on your **AWS Lightsail VPS** (4GB RAM, 2 vCPUs, 80GB SSD) where **Nginx is running inside Docker** alongside your existing blog and local DNS resolver.

The setup guarantees **zero-interference coexistence**:
- **Port 53 (DNS Resolver)**: Untouched. Docker does not bind to port 53.
- **Ports 80 & 443 (Existing Blog)**: Managed by your existing Dockerized Nginx container.
- **StreamParty App**: Runs in its own container (`screenshare-app`) connected to Nginx over Docker's internal network or host bridge on port **`38282`**.

---

### Architecture: Dockerized Nginx to StreamParty Container

```
+───────────────────────────────────────────────────────────────────────────────────────────────────+
| AWS Lightsail Instance (4GB RAM, 2 vCPUs)                                                          |
|                                                                                                   |
|  [Public Network]                                                                                 |
|         │                                                                                         |
|         ├── Port 53 (UDP/TCP)  ───> [ Local DNS Resolver (BIND/CoreDNS/dnsmasq) ]                 |
|         │                                                                                         |
|         └── Ports 80 & 443     ───> [ Docker: Nginx / NPM Container ]                            |
|                                            │                                                      |
|                                            ├── yourdomain.com        ───> [ Existing Blog Site ]  |
|                                            │                                                      |
|                                            └── stream.yourdomain.com ───> [ Shared Docker Network]|
|                                                                                   │               |
|                                                                                   ▼               |
|                                                                    [ Docker: screenshare-app ]    |
|                                                                    (Port 38282, In-Memory Rooms)  |
+───────────────────────────────────────────────────────────────────────────────────────────────────+
```

> [!IMPORTANT]
> **Understanding Docker Networking (`127.0.0.1` vs Container Hostname)**
> When Nginx runs inside a Docker container, `127.0.0.1` refers to **the Nginx container itself**, NOT the host.
> To proxy from your Nginx container to the `screenshare-app` container:
> - **Method 1 (Shared Docker Network - Recommended)**: Both containers share a Docker network. Nginx proxies to `http://screenshare-app:38282`.
> - **Method 2 (Host Gateway)**: If not on the same network, Nginx proxies to `http://172.17.0.1:38282` (the Docker default bridge gateway IP) or `http://host.docker.internal:38282`.

---

### Phase 1: DNS Record Setup

In your domain registrar or DNS management dashboard (e.g., Cloudflare, Route 53, Namecheap):

1. Add an **A Record**:
   - **Type**: `A`
   - **Name / Subdomain**: `stream` (which resolves to `stream.yourdomain.com`)
   - **IPv4 Address**: Your AWS Lightsail static public IP address
   - **TTL**: `Auto` or `300` seconds

> [!TIP]
> **If using Cloudflare**: Set proxy status to **DNS Only** (grey cloud) while obtaining Let's Encrypt certificates. You can re-enable proxying later as long as WebSockets are enabled in Cloudflare Network settings.

---

### Phase 2: Lightsail Firewall Check

In the **AWS Lightsail Console** under **Networking**:
- Confirm that ports **`22`** (SSH), **`80`** (HTTP), **`443`** (HTTPS), and **`53`** (DNS) are listed.
- **Do NOT open port 38282 in the Lightsail firewall.** Port 38282 is private and only used inside Docker / localhost.

---

### Phase 3: Transfer Project to Your Lightsail VPS

Connect to your Lightsail VPS via SSH:
```bash
ssh -i /path/to/lightsail-key.pem ubuntu@YOUR_LIGHTSAIL_IP
```

Clone your repository into your home directory:
```bash
git clone git@github.com:YOUR_USERNAME/YOUR_REPOSITORY.git ~/watchparty
cd ~/watchparty
```

---

### Phase 4: Build & Launch StreamParty Container

Inside `~/watchparty`:

#### 1. Create the Environment File
```bash
cp .env.example .env
```

#### 2. Start the StreamParty Container
```bash
docker compose up -d --build
```

#### 3. Verify Container is Running
```bash
docker compose ps
docker compose logs -f app
```
You should see:
```text
[SERVER] Screen & Voice streaming server listening on 0.0.0.0:38282
```

#### 4. Test Local Health Check on the Host
```bash
curl -I http://127.0.0.1:38282/health
```
Expected output: `HTTP/1.1 200 OK`.

---

### Phase 5: Connect Nginx Container to StreamParty

Since your Nginx is running in Docker, you must allow your Nginx container to communicate with `screenshare-app`.

#### Step 5.1: Identify Your Nginx Container Name & Network
Run:
```bash
docker ps
```
Look for your Nginx container name (e.g., `nginx`, `nginx-proxy`, `npm_app`, etc.).

Now inspect the network your Nginx container is using:
```bash
# Replace "nginx" with your actual Nginx container name
docker inspect nginx --format '{{range $net, $v := .NetworkSettings.Networks}}{{printf "%s\n" $net}}{{end}}'
```
*Example output might be: `bridge`, `nginx_default`, `proxy`, or `web`.*

#### Step 5.2: Connect `screenshare-app` to the Same Network
Connect the StreamParty container to that network with a single command:
```bash
# Syntax: docker network connect <NETWORK_NAME> screenshare-app
# Example:
docker network connect nginx_default screenshare-app
```
*(If your Nginx is on the default `bridge` network, you can skip this command as they both reach the host via `172.17.0.1`).*

---

### Phase 6: Configure Your Dockerized Nginx

Choose **Method A** (Standard Docker Nginx with configuration files) or **Method B** (Nginx Proxy Manager Web UI):

---

#### Method A: Standard Docker Nginx (`conf.d/` directory)

Standard Nginx Docker containers load configuration files from `/etc/nginx/conf.d/*.conf`, which is mounted to a directory on your Lightsail host.

1. **Find where your Nginx `conf.d` directory is mounted on the host**:
   ```bash
   docker inspect nginx --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
   ```
   *Look for the folder on the left pointing to `/etc/nginx/conf.d` (for example, `/home/ubuntu/nginx/conf.d` or `/opt/nginx/conf.d`).*

2. **Copy `nginx.sample.conf` to that mounted directory**:
   ```bash
   # Replace /path/to/nginx/conf.d with your actual host directory
   cp ~/watchparty/nginx.sample.conf /path/to/nginx/conf.d/stream.conf
   ```

3. **Update the Domain & Upstream**:
   Edit `/path/to/nginx/conf.d/stream.conf`:
   - Replace `stream.yourdomain.com` with your actual subdomain.
   - Verify `proxy_pass http://screenshare-app:38282;` is active:
   ```nginx
   location / {
       proxy_pass http://screenshare-app:38282;

       # WebSocket upgrade headers
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "upgrade";

       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;

       proxy_read_timeout 86400s;
       proxy_send_timeout 86400s;
       proxy_connect_timeout 60s;
       proxy_buffering off;
   }
   ```

4. **Test & Reload Nginx inside Docker**:
   ```bash
   docker exec -it nginx nginx -t
   docker exec -it nginx nginx -s reload
   ```

---

#### Method B: Nginx Proxy Manager (NPM Web UI)

If your Nginx container is **Nginx Proxy Manager** (running with a web UI on port 81):

1. Open your NPM dashboard (`http://YOUR_LIGHTSAIL_IP:81`).
2. Navigate to **Hosts** > **Proxy Hosts** > click **Add Proxy Host**.
3. Under the **Details** tab:
   - **Domain Names**: `stream.yourdomain.com`
   - **Scheme**: `http`
   - **Forward Hostname / IP**: `screenshare-app` *(or `172.17.0.1` if using host bridge)*
   - **Forward Port**: `38282`
   - Toggle **ON**: **Cache Assets**
   - Toggle **ON**: **Block Common Exploits**
   - Toggle **ON**: **Websockets Support** *(CRITICAL for real-time WebRTC signaling)*
4. Under the **SSL** tab:
   - **SSL Certificate**: Select **Request a new SSL Certificate**
   - Toggle **ON**: **Force SSL**
   - Toggle **ON**: **HTTP/2 Support**
   - Enter your email and agree to Let's Encrypt terms.
5. Click **Save**.

---

### Phase 7: Coexistence & Functionality Verification

Verify all services on the server:

```bash
# 1. Verify your existing blog is healthy
curl -I https://yourdomain.com

# 2. Verify your DNS resolver on port 53 is resolving correctly
dig @127.0.0.1 yourdomain.com

# 3. Verify the screen-sharing app health endpoint through your domain
curl -I https://stream.YOUR_DOMAIN.com/health
```

#### Test Live in Your Browser:
1. Navigate to `https://stream.YOUR_DOMAIN.com`.
2. Confirm the page loads with the **Fira Code** font and **Black & Red** aesthetic.
3. Click **"START ROOM"** — you enter immediately with zero login prompts.
4. Click **"Start Screen Share"** — select your screen or browser tab with "Share tab audio".
5. Click **"Join Voice"** — grant mic access and confirm speaking indicator pulses.
6. Click **"Copy Invite Link"** and open the link on another device to confirm low-latency (<200ms) screen and audio transmission.

---

### Phase 8: Operational Commands & Maintenance

#### Viewing Live Application Logs
```bash
cd ~/watchparty
docker compose logs -f --tail=100 app
```

#### Restarting the StreamParty Container
```bash
cd ~/watchparty
docker compose restart app
```

#### Pulling Updates from GitHub
```bash
cd ~/watchparty
git pull origin main
docker compose up -d --build
```

#### Reconnecting Network After Docker Daemon Restarts (if needed)
If you recreate containers and they need network re-linking:
```bash
docker network connect <YOUR_NGINX_NETWORK> screenshare-app
```
*(Or add `networks: - <YOUR_NGINX_NETWORK>` directly in `docker-compose.yml` under `networks` as an `external: true` network).*

---

### Troubleshooting Common Issues

#### 1. "502 Bad Gateway" in Browser
- **Cause A**: Nginx is trying to connect to `127.0.0.1:38282` instead of `screenshare-app:38282`.
  - **Fix**: Update Nginx `proxy_pass` to `http://screenshare-app:38282;` or `http://172.17.0.1:38282;`.
- **Cause B**: Containers are not on the same Docker network.
  - **Fix**: Run `docker network connect <NGINX_NETWORK> screenshare-app`.
- **Cause C**: `screenshare-app` container is stopped.
  - **Fix**: Run `docker compose ps` and `docker compose up -d`.

#### 2. WebSocket Connection Drops / Retries
- **Cause**: Missing WebSocket upgrade directives in Nginx.
- **Fix**: Confirm your Nginx config has `proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection "upgrade";` (or in NPM, verify "Websockets Support" toggle is ON).
