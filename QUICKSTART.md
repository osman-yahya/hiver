# 🐝 Hiver — Quickstart Guide

Get the full Hiver stack running in under 5 minutes.

---

## Prerequisites

- Docker & Docker Compose installed on your **Mother server** (the machine running the dashboard)
- Docker installed on every **target server** you want to monitor
- The two machines must be able to reach each other over the network

---

## Step 1 — Configure the Mother Server

Clone or copy the Hiver project folder to your Mother server, then create your `.env` file:

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```env
# Required — change this to a long random string
HIVER_SECRET_KEY=replace_with_a_long_random_secret_here

# Initial admin credentials (change after first login)
HIVER_ADMIN_USER=admin
HIVER_ADMIN_PASSWORD=changeme

# Database — SQLite is fine for most homelabs
DATABASE_URL=sqlite:///./data/hiver.db

# Redis — leave as-is when using docker-compose
REDIS_URL=redis://hiver-redis:6379/0

# Port the dashboard will be exposed on
HIVER_PORT=8000
```

> **Tip:** Generate a strong secret key with:
> ```bash
> openssl rand -hex 32
> ```

---

## Step 2 — Start the Mother Stack

```bash
docker compose up -d
```

This starts two containers:

| Container | Role |
|---|---|
| `hiver-mother` | FastAPI backend + React UI |
| `hiver-redis` | Message queue for log processing |

Check they're running:

```bash
docker compose ps
docker compose logs -f hiver-mother
```

The dashboard is now available at **`http://<your-mother-ip>:8000`**

---

## Step 3 — Log In

Open the dashboard in your browser and sign in with the credentials from your `.env`:

- **Username:** `admin` (or whatever you set)
- **Password:** `changeme` (change this immediately after first login)

---

## Step 4 — Deploy an Agent on a Target Server

Run the following command **on each server you want to monitor**. Replace the values in `< >`:

```bash
docker run -d \
  --name hiver-agent \
  --restart unless-stopped \
  -e MOTHER_URL=http://<your-mother-ip>:8000 \
  -e SERVER_LABEL=<your-server-name> \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /proc:/host/proc:ro \
  --pid host \
  osmanyahyaakinci/hiver-agent:latest
```

| Variable | Description | Example |
|---|---|---|
| `MOTHER_URL` | Full URL of your Hiver Mother server | `http://192.168.1.10:8000` |
| `SERVER_LABEL` | Human-readable name shown in the dashboard | `prod-web-01` |

> **Tip:** The dashboard can generate this command for you. Go to **Servers → Add Server**, enter a label, and click **Generate Deploy Command** — then just copy and paste it.

### Optional Agent Variables

| Variable | Default | Description |
|---|---|---|
| `POLL_INTERVAL_SECONDS` | `10` | How often metrics are sent |
| `LOG_KEYWORDS` | `error,panic,exception,fatal,critical,killed,oom` | Comma-separated keywords that trigger log capture |

---

## Step 5 — Verify the Agent Connected

Within a few seconds the server should appear in the dashboard with a 🟢 **Online** status. If it doesn't:

1. Check the agent logs: `docker logs hiver-agent`
2. Confirm `MOTHER_URL` is reachable from the target server:
   ```bash
   curl http://<your-mother-ip>:8000/api/agents/register
   ```
3. Check the Mother logs: `docker compose logs hiver-mother`

---

## Step 6 — (Optional) Enable AI Log Analysis

1. Make sure you have **Ollama** running somewhere on your network with a model pulled:
   ```bash
   ollama pull llama3
   ollama serve   # listens on :11434 by default
   ```

2. In the Hiver dashboard, go to **Admin → AI Engine**:
   - Toggle **Enable AI Analysis** → ON
   - Set **Ollama API URL** to `http://<ollama-host>:11434`
   - Set **Model Name** to `llama3` (or whichever model you pulled)
   - Click **🔌 Test Connection** to verify — it will list available models
   - Click **Save Settings**

From that point on, any error logs captured from your containers will be automatically analysed and shown with a plain-English explanation in the **Error Logs** page.

> Ollama never needs to be reachable at deploy time. If it goes offline, Hiver automatically falls back to displaying the raw log — your monitoring is never interrupted.

---

## Monitoring Multiple Servers

Repeat **Step 4** for each server, changing `SERVER_LABEL` each time. All agents report to the same Mother and appear automatically in the dashboard.

```bash
# Server 2
docker run -d --name hiver-agent --restart unless-stopped \
  -e MOTHER_URL=http://192.168.1.10:8000 \
  -e SERVER_LABEL=nas-01 \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /proc:/host/proc:ro \
  --pid host \
  osmanyahyaakinci/hiver-agent:latest

# Server 3
docker run -d --name hiver-agent --restart unless-stopped \
  -e MOTHER_URL=http://192.168.1.10:8000 \
  -e SERVER_LABEL=media-server \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /proc:/host/proc:ro \
  --pid host \
  osmanyahyaakinci/hiver-agent:latest
```

---

## Updating

**Mother stack:**
```bash
docker compose pull
docker compose up -d
```

**Agents (on each target server):**
```bash
docker pull osmanyahyaakinci/hiver-agent:latest
docker stop hiver-agent && docker rm hiver-agent

docker run -d \
  --name hiver-agent \
  --restart unless-stopped \
  -e MOTHER_URL=http://<your-mother-ip>:8000 \
  -e SERVER_LABEL=<your-server-name> \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  -v /proc:/host/proc:ro \
  --pid host \
  osmanyahyaakinci/hiver-agent:latest
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Server card shows ⚫ Unknown | Agent hasn't sent its first heartbeat yet — wait 10s |
| Server card shows 🔴 Offline | Agent can't reach Mother — check `MOTHER_URL` and firewall |
| AI analysis not appearing | Click "Test Connection" in Admin → AI Engine — check Ollama is up |
| Dashboard unreachable | `docker compose ps` — ensure `hiver-mother` is running |
| `docker.sock` permission error | Add the agent user to the `docker` group or run with `--user root` |

---

*That's it! Your homelab is now being watched by Hiver. 🐝*
