# Deploy na Vercel + Convex Cloud

Nejrychlejší cesta do produkce. Setup ~15–30 minut, nulová údržba serveru.

## Architektura

```
Internet → Vercel (Next.js Edge/Serverless, fra1) → Convex Cloud (DB+Auth+Storage)
                                                          ↓
                                                       Resend (e-mail)
```

---

## 1. GitHub repo (5 min)

```bash
cd C:\Users\lukas.suser\Projekty\techmania-projects

# Pokud ještě nemáš remote:
git remote add origin git@github.com:<tvuj-user>/techmania-projekty.git

# Commit aktuálního stavu + push
git add -A
git commit -m "Production-ready setup"
git push -u origin main
```

Repo udělej **private** — obsahuje interní data Techmania.

## 2. Convex — produkční deployment (5 min)

Z dev stroje (nikdy z Vercelu):

```bash
cd techmania-projects

# Vytvoří prod deployment (oddělený od dev). Při prvním spuštění tě přihlásí.
npx convex deploy

# Vygeneruj prod auth klíče (JWT pro magic link)
npx @convex-dev/auth

# Site URL — bez https magic link nepůjde
npx convex env set --prod SITE_URL https://projekty.techmania.cz

# Resend API klíč (přeskoč, pokud Resend ještě nemáš — viz krok 4)
npx convex env set --prod AUTH_RESEND_KEY re_xxxxxxxxxxx
npx convex env set --prod AUTH_EMAIL_FROM "Techmania Projekty <noreply@techmania.cz>"
```

V Convex dashboardu (https://dashboard.convex.dev) si zkopíruj:
- **Production HTTP URL** (vypadá jako `https://abc-def-123.convex.cloud`)
- **CONVEX_DEPLOY_KEY** (Settings → Deploy Keys → „Generate Production Deploy Key")

## 3. Vercel — projekt (5 min)

1. Otevři **https://vercel.com/new**
2. Klikni „Import Git Repository" → vyber `techmania-projekty`
3. **Framework Preset:** Next.js (autodetekce)
4. **Root Directory:** `./` (default)
5. **Build Command:** ponech default — `vercel.json` v repu už nastavuje
   `npx convex deploy --cmd 'npm run build'`
6. **Environment Variables** (klikni „Add"):

   | Name | Value | Environments |
   |---|---|---|
   | `CONVEX_DEPLOY_KEY` | `prod_xxx...` (z Convex dashboardu) | Production |
   | `NEXT_PUBLIC_CONVEX_URL` | `https://abc-def-123.convex.cloud` | Production |

   `CONVEX_DEPLOY_KEY` je secret — Vercel ho šifruje, není v logu.
   Buildscript přečte deploy key a sám zavolá `convex deploy` před `next build`,
   takže Convex backend se nasazuje synchronně s frontendem.

7. **Deploy** — první build trvá ~3 min.

Po úspěšném buildu máš app na `https://techmania-projekty.vercel.app`.

## 4. Resend — e-mail (10 min)

1. Registruj na **https://resend.com** (free 3 000 e-mailů/měsíc)
2. **Domains → Add Domain:** `techmania.cz`
3. Resend ti dá ~4 DNS záznamy (SPF TXT, DKIM CNAME×3) — přidej do DNS panelu Techmania
4. Počkej, až Resend status změní na **Verified** (zpravidla 5–60 min)
5. **API Keys → Create API Key** (full access, production) → zkopíruj `re_xxxxx`
6. Vlož do Convex (krok 2 výše) + redeploy:
   ```bash
   npx convex env set --prod AUTH_RESEND_KEY re_xxxxxxxxxxx
   ```

Tímto magic link začne reálně chodit na e-mail.

## 5. Vlastní doména `projekty.techmania.cz` (5 min)

### V DNS panelu Techmania

Přidej **CNAME** záznam:

```
projekty.techmania.cz   CNAME   cname.vercel-dns.com.
```

Pokud root domain (`techmania.cz`) je registrovaná u Centra hostingu / Forpsi /
Wedos: jdi do DNS managementu a přidej CNAME ručně. TTL 3600 stačí.

Pokud z DNS důvodů nejde CNAME na subdoméně (např. CDN ji kolizuje), Vercel
nabízí alternativu **A záznam** `76.76.21.21` — UI tě navede.

### Ve Vercelu

1. Project → **Settings → Domains**
2. Vlož `projekty.techmania.cz` → „Add"
3. Vercel ověří DNS (do 5 min) a vystaví Let's Encrypt cert automaticky
4. **Zaškrtni „Redirect to https"** (default zapnuto)

### Aktualizuj SITE_URL v Convexu

```bash
npx convex env set --prod SITE_URL https://projekty.techmania.cz
```

(Jinak magic linky vedou na `vercel.app` doménu.)

## 6. První admin (2 min)

1. Otevři **https://projekty.techmania.cz**
2. Klikni „Přihlásit se", zadej **svůj e-mail** (lukas.suser@techmania.cz)
3. E-mail přijde z Resendu → klikni magic link
4. Aplikace tě zavede na bootstrap obrazovku → „Stát se administrátorem"
5. V `/admin/uzivatele` pozvi další lidi (Petr — PM, Iveta — IT lead, atd.)

**Neseeduj v produkci** test data — pozvi reálné uživatele.

## 7. Update workflow

```bash
# Lokálně po vývoji
git add -A
git commit -m "feat: new feature"
git push
```

Vercel automaticky:
- Buildne novou verzi z `main`
- `npx convex deploy` synchronně updatuje Convex funkce
- Atomicky přepne traffic na novou verzi (zero downtime)

Pull requesty dostávají **preview deployment** (vlastní URL, vlastní Convex
dev deployment — pohodlné pro review).

## 8. Náklady

| Položka | Měsíčně |
|---|---|
| Vercel Hobby | **0 Kč** (pro nekomerční, do 100 GB bandwidth) |
| Vercel Pro | 20 USD (~480 Kč) — pokud chceš víc team členů + komerční SLA |
| Convex Cloud | **0 Kč** do 1M dokumentů + 1M function calls/měsíc |
| Resend | **0 Kč** do 3 000 e-mailů/měsíc |
| Doména (subdoména existující) | 0 Kč |
| **Celkem (free tier)** | **0 Kč** |

Vercel Hobby technicky není určen pro komerční použití. Pro interní firemní
nástroj v 10–30 lidech je to šedá zóna — Vercel to běžně toleruje, ale formálně
by Techmania měla mít Pro plán (480 Kč/měsíc).

## 9. Bezpečnost & operace

- **Secrets v Vercelu:** všechny env vary šifrované at rest. `CONVEX_DEPLOY_KEY`
  je „Sensitive" — nevidět zpětně v UI.
- **HTTPS:** Vercel + Let's Encrypt, auto-renew. Žádný setup.
- **Backupy:** Convex Cloud má daily auto-backup, 7 dní retention. Manuální
  export: `npx convex export --prod --path backup.zip`.
- **Audit log:** v app `/admin/audit` (jen pro adminy).
- **Monitoring:** Vercel Analytics zdarma, Convex dashboard pro DB metriky.

## 10. Časté problémy

**„NEXT_PUBLIC_CONVEX_URL is not defined"** během buildu
→ Chybí env var ve Vercelu. Přidej v Project Settings → Environment Variables.

**Magic link vede na vercel.app, ne na techmania.cz**
→ Nezměnil jsi `SITE_URL` v Convex prod env. Spusť `npx convex env set --prod SITE_URL https://projekty.techmania.cz` a redeployuj.

**Build failuje na „Convex deploy auth"**
→ `CONVEX_DEPLOY_KEY` ve Vercelu je z **dev** deploymentu, ne prod. Vygeneruj
nový v Convex dashboard → Settings → Deploy Keys → „Production".

**„Resend domain not verified"**
→ DNS záznamy ještě nepropagovaly. Počkej ~30 min, nebo zkontroluj přes
`dig TXT techmania.cz` že SPF záznam existuje.

**Cold start je pomalý (>2s první load)**
→ Vercel Hobby má cold starts na serverless. Pro stálý warm state Vercel Pro
nebo přepnout na vlastní server (DEPLOYMENT.md).

---

## TL;DR — copy-paste sekvence

```bash
# 1. Push na GitHub
git push origin main

# 2. Convex prod
npx convex deploy
npx @convex-dev/auth
npx convex env set --prod SITE_URL https://projekty.techmania.cz

# 3. Vercel: vercel.com/new → import repo → env vars → Deploy

# 4. Resend: resend.com → add domain → API key → vlož do Convex
npx convex env set --prod AUTH_RESEND_KEY re_xxx

# 5. Doména: DNS CNAME projekty.techmania.cz → cname.vercel-dns.com
#    Vercel: Settings → Domains → add projekty.techmania.cz

# 6. https://projekty.techmania.cz → magic link → bootstrap admin → hotovo
```
