# Production deployment — vlastní server s veřejnou IP

Průvodce nasazením Techmania Projekty na **vlastní Linux server** s veřejnou IP. Předpokládá Debian/Ubuntu.

## Architektura

```
Internet
   │
   ▼  (HTTPS, port 443)
[Caddy]  ◄──── reverse proxy + Let's Encrypt TLS
   │
   ▼  (HTTP, port 3000)
[Next.js]  ◄──── PM2 manages process
   │
   ▼  (HTTPS přes internet)
[Convex Cloud]  ◄──── DB + auth + files + real-time
   │
   ▼  (volitelně)
[Resend]  ◄──── e-mail notifikace
```

**Doporučení:** používat **Convex Cloud** (free tier zvládne tým 10–30 lidí). Důvody:
- Žádný DB management, backupy automatické
- Real-time WebSockets fungují out-of-the-box (proxy-friendly)
- Auth, file storage, scheduled actions zdarma
- Self-hosted Convex je možné (Docker), ale je to víc údržby — jen pokud máš data sovereignty požadavky

---

## 1. DNS

V tvém DNS providerovi nastav A záznam:

```
projekty.tvuj-domain.cz   A   <veřejná-IP-serveru>
```

Pokud domain nemáš, můžeš jet na holé IP — ale Let's Encrypt nedá certifikát na IP. Doporučení: zaregistruj `.cz` doménu (~150 Kč/rok) nebo subdoménu existující firemní domény.

## 2. Server — prerequisites

```bash
# Ubuntu / Debian
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ca-certificates gnupg ufw

# Node.js 20+ (přes NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs

# PM2 (process manager)
sudo npm install -g pm2

# Git (pro deploy)
sudo apt install -y git

# Caddy (reverse proxy + auto HTTPS)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp        # HTTP (pro Let's Encrypt challenge)
sudo ufw allow 443/tcp       # HTTPS
sudo ufw enable
```

**Nepoužívej** port 3000 přímo z internetu — Next.js poslouchá lokálně, Caddy ho zveřejňuje.

## 3. Convex — produkční deployment

### A) Convex Cloud (doporučeno)

Z dev stroje (ne ze serveru):

```bash
cd techmania-projects
npx convex deploy --prod
```

Při prvním spuštění:
1. Convex si vyžádá login (otevře browser)
2. Vytvoří **production deployment** (jiné prostředí než tvoje dev)
3. Vrátí ti `CONVEX_DEPLOY_KEY` a deployment URL

Ulož `CONVEX_DEPLOY_KEY` — budeš ho dávat na server v env.

### Init Convex Auth (jednorázově pro prod)

```bash
npx @convex-dev/auth --prod
```

Vygeneruje JWT klíče a uloží do prod env.

### Nastav prod env proměnné

```bash
npx convex env set --prod SITE_URL https://projekty.tvuj-domain.cz
npx convex env set --prod AUTH_RESEND_KEY re_xxxxx           # po setup Resendu
npx convex env set --prod AUTH_EMAIL_FROM "Techmania Projekty <noreply@tvuj-domain.cz>"
```

### B) Self-hosted Convex (volitelné, pokročilé)

```bash
# Na serveru:
docker run -d --name convex \
  -p 3210:3210 -p 3211:3211 -p 6790:6790 \
  -v convex-data:/convex/data \
  --restart unless-stopped \
  ghcr.io/get-convex/convex-backend:latest
```

Pak `CONVEX_SELF_HOSTED_URL=http://localhost:3210` a deploy přes `npx convex deploy --prod-url ...`.

Nevýhody: údržba DB, backupy, monitoring na tobě. Doporučuji **Cloud**.

## 4. Resend — e-mail

1. Registruj na [resend.com](https://resend.com) (free 3000 e-mailů/měsíc)
2. Ověř doménu (přidej DNS TXT/CNAME — Resend dá kroky)
3. Vygeneruj **Production API key** (pro `AUTH_RESEND_KEY`)
4. Nastav v Convex env (krok 3A výše)

Bez Resendu: magic linky se nepošlou e-mailem, ale půjde je vyčíst z Convex logů (pro produkci nepoužitelné).

## 5. Server — clone repo + build

```bash
# Vytvoř service user (best practice)
sudo useradd -m -s /bin/bash projekty
sudo su - projekty

# Clone
cd /home/projekty
git clone https://github.com/tvuj-username/techmania-projects.git
cd techmania-projects

# Install
npm ci

# Production env
cat > .env.production.local <<EOF
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
CONVEX_DEPLOY_KEY=prod_<klíč-z-Convex-deploy>
EOF

chmod 600 .env.production.local

# Build
npm run build

# Test, že běží
NODE_ENV=production npm start
# → Next.js naběhne na :3000, otestuj přes lynx http://localhost:3000
# → Ctrl+C
```

## 6. PM2 — process management

```bash
# Vytvoř ecosystem config
cat > ecosystem.config.cjs <<EOF
module.exports = {
  apps: [
    {
      name: 'techmania-projekty',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production' },
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      error_file: '/home/projekty/logs/err.log',
      out_file: '/home/projekty/logs/out.log',
    },
  ],
}
EOF

mkdir -p /home/projekty/logs
pm2 start ecosystem.config.cjs
pm2 save

# Auto-start při restartu serveru
pm2 startup systemd -u projekty --hp /home/projekty
# → vypíše příkaz s sudo, spusť ho
```

## 7. Caddy — HTTPS reverse proxy

```bash
sudo nano /etc/caddy/Caddyfile
```

Vlož:

```
projekty.tvuj-domain.cz {
    encode zstd gzip
    reverse_proxy localhost:3000

    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "geolocation=(), microphone=(), camera=()"
    }

    # Static files cache
    @static path *.js *.css *.svg *.png *.jpg *.jpeg *.webp *.woff *.woff2 *.ico
    header @static Cache-Control "public, max-age=31536000, immutable"
}
```

```bash
sudo systemctl reload caddy
sudo caddy validate --config /etc/caddy/Caddyfile
```

Caddy automaticky vyžádá Let's Encrypt cert během prvního requestu na 443.

**Otestuj:** `curl -I https://projekty.tvuj-domain.cz` → měl bys dostat 200/307.

## 8. První přihlášení

1. Otevři `https://projekty.tvuj-domain.cz`
2. Zadej svůj e-mail
3. Magic link přijde na e-mail (Resend) — pokud Resend nefunguje, najdeš ho v Convex dashboard logs (`https://dashboard.convex.dev`)
4. Klikni v dashboardu „Stát se administrátorem" — bootstrap prvního admina
5. Pozvi další uživatele přes `/admin/uzivatele`

## 9. Update workflow

Když vyvineš novou funkci na svém dev stroji:

```bash
# Na dev:
git push origin main
npx convex deploy --prod      # nasadí backend změny

# Na serveru:
sudo su - projekty
cd /home/projekty/techmania-projects
git pull
npm ci
npm run build
pm2 reload techmania-projekty
```

Nulo-downtime deploy: `pm2 reload` nahradí instance po jednom (s `instances: 'max'`).

## 10. Backupy

**Convex Cloud:** automatické daily backups (7 dní retention v free tier). Manual export:

```bash
npx convex export --prod --path ./backup-$(date +%F).zip
```

Nastav cron:

```bash
crontab -e
# Přidat:
0 2 * * * cd /home/projekty/techmania-projects && /usr/bin/npx convex export --prod --path /home/projekty/backups/$(date +\%F).zip
```

**Self-hosted Convex:** zálohovat `/convex/data` volume (rsync na NAS, S3, atd.).

## 11. Monitoring

### Logy
```bash
pm2 logs techmania-projekty --lines 100
sudo journalctl -u caddy -n 100
```

### Health check endpoint

V `next.config.ts` přidej (volitelně) jednoduchý endpoint pro uptime monitoring:

```ts
// app/api/health/route.ts
export async function GET() {
  return Response.json({ ok: true, ts: Date.now() });
}
```

Pak nastav v UptimeRobot / Better Stack / vlastní cron monitoring na `https://projekty.tvuj-domain.cz/api/health`.

### Convex dashboard

`https://dashboard.convex.dev` — vidíš počet queries/sekundu, errors, logs. Pro production hodně užitečné.

## 12. Bezpečnost — checklist

- [ ] SSH jen přes klíče (`PasswordAuthentication no` v `/etc/ssh/sshd_config`)
- [ ] `ufw` aktivní, povolené jen 22/80/443
- [ ] Service user `projekty` nemá sudo
- [ ] `.env.production.local` má `chmod 600`
- [ ] `CONVEX_DEPLOY_KEY` neuložený v Gitu (`.gitignore` má `.env*.local`)
- [ ] Pravidelné `unattended-upgrades` (Debian/Ubuntu auto security patches)
- [ ] Caddy auto-renewuje certs (default funguje)
- [ ] Backupy testované — alespoň jednou ověřit, že se umí obnovit

## 13. Doménové úvahy

- **Subdoménu firmy** (např. `projekty.techmania.cz`) — nejjednodušší
- **Vlastní doménu** (`techmania-projekty.cz`) — víc setupu, ale separátní brand
- **HTTPS-only**: Caddy redirectuje 80 → 443 by default, žádný extra config

## 14. Náklady

| Položka | Měsíčně |
|---|---|
| Vlastní server (existing) | 0 (já mám) |
| Doména `.cz` | ~12 Kč |
| Convex Cloud | **0** Kč (free do 1M dokumentů, 1M function calls/měsíc) |
| Resend | **0** Kč (free 3 000 e-mailů, 100/den) |
| Let's Encrypt | 0 Kč |
| **Celkem** | **~12 Kč/měsíc** |

Jakmile překročíš free tier, Convex přechází na $25/měsíc plán.

## 15. Časté problémy

**„Internal Server Error" po deploy** → zkontroluj `pm2 logs`. Většinou: chybí `NEXT_PUBLIC_CONVEX_URL` v `.env.production.local`.

**Magic link nefunguje (404)** → Convex Auth potřebuje `SITE_URL` prod env nastaveno na HTTPS doménu, ne `localhost:3000`.

**„Mixed content" warning** → někde v kódu hardcoded `http://`. Zkontroluj `.env.production.local` — všechny URL musí být `https://`.

**WebSocket disconnects** → Caddy default umí WebSockety; pokud nastavíš custom matchery, ujisti se, že proxy umí upgrade. Default `reverse_proxy` je OK.

**„CORS error" pro Convex** → ne-issue, Convex Cloud má whitelisted origin přes `NEXT_PUBLIC_CONVEX_URL`.

**Chybějící šablony / dev data v produkci** → seed funkce (`api.seed.seedDevData`) je dostupná i v prod, ale obsahuje `+test@techmania.cz` adresy. Pro reálnou data tu nepouštěj. Místo toho v `/admin/uzivatele` pozvi reálné uživatele.

---

## TL;DR příkazy

```bash
# Server prep
sudo apt install nodejs npm pm2 caddy
sudo ufw allow 80,443/tcp && sudo ufw enable

# Repo
git clone <repo> && cd techmania-projects
npm ci

# Convex prod (na dev stroji)
npx convex deploy --prod
npx @convex-dev/auth --prod
npx convex env set --prod SITE_URL https://projekty.tvuj-domain.cz
npx convex env set --prod AUTH_RESEND_KEY re_xxx

# Build
echo 'NEXT_PUBLIC_CONVEX_URL=https://xyz.convex.cloud' > .env.production.local
npm run build

# Run
pm2 start ecosystem.config.cjs && pm2 save
pm2 startup systemd

# HTTPS
echo "projekty.domain.cz { reverse_proxy localhost:3000 }" | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Až do bodu 5 mě jdi, pak volej.
