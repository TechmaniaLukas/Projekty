# Techmania Projekty

Interní webová aplikace pro správu projektů technického oddělení Techmania Science Center. Pokrývá projekty napříč 3 odděleními (IT, Facility, Výroba), úkoly s libovolnou hloubkou podúkolů, přiřazení, termíny, role a real-time komentáře.

## Tech stack

- **Next.js 16** (App Router) + **React 19** + **Tailwind CSS 4**
- **Convex** (databáze, real-time, file storage, scheduled actions)
- **Convex Auth** s magic linkem (passwordless e-mail)
- TypeScript, lucide-react, date-fns (cs locale)

## První spuštění

Aplikace má dvě části: Convex backend a Next.js frontend. Obojí běží paralelně.

### 1. Inicializace Convex (jednorázově)

V kořenovém adresáři spusť:

```bash
npx convex dev
```

CLI tě provede:
1. Přihlášením do Convex (otevře prohlížeč)
2. Vytvořením nového projektu (doporuč. název: `techmania-projects`)
3. Volbou týmu

Po dokončení se automaticky:
- Vytvoří `convex/_generated/` (TypeScript typy)
- Nasadí schema a všechny funkce
- Doplní `NEXT_PUBLIC_CONVEX_URL` do `.env.local`

`npx convex dev` zůstává v terminálu spuštěný a hot-reloaduje funkce při změně.

### 2. Inicializace Convex Auth (jednorázově)

Ve **třetím** terminálu (s běžícím `npx convex dev`):

```bash
npx @convex-dev/auth
```

Vygeneruje JWT klíče (`JWT_PRIVATE_KEY`, `JWKS`) a nahraje je do Convex env. Bez tohoto kroku magic link login selže s chybou JWT.

Volitelně nastav adresu frontendu:

```bash
npx convex env set SITE_URL http://localhost:3000
```

### 3. Spuštění frontendu

V druhém terminálu:

```bash
npm run dev
```

Aplikace běží na `http://localhost:3000`.

### 4. Bootstrap admina

Při prvním přihlášení:

1. Otevři `http://localhost:3000`, automatický redirect na `/prihlaseni`
2. Zadej svůj e-mail a klikni "Poslat přihlašovací odkaz"
3. **V dev režimu** se magic link vypíše do terminálu, kde běží `npx convex dev`. Hledej:
   ```
   =========================================
    MAGIC LINK pro: tvuj@email.cz
    URL: https://...
   =========================================
   ```
4. Otevři URL v prohlížeči – jsi přihlášený
5. Na dashboardu klikni **„Stát se administrátorem"** (zobrazí se, dokud aplikace nemá žádného admina)
6. V menu se objeví **Uživatelé** – zde můžeš přidat zbytek týmu nebo kliknout **„Naseedovat dev data"** a získat 5 testovacích uživatelů + 3 ukázkové projekty s úkoly

### 5. Produkční odesílání e-mailů (volitelné)

Pro skutečné odesílání magic linků (mimo dev konzole) nastav v Convex env:

```bash
npx convex env set AUTH_RESEND_KEY re_xxxxxxxx
npx convex env set AUTH_EMAIL_FROM "Techmania Projekty <noreply@tvuj-domain.cz>"
```

[Resend.com](https://resend.com) má volný plán 3000 e-mailů/měsíc.

## Role a oprávnění

| Akce | admin | pm | department_lead | member |
|------|-------|-----|-----------------|--------|
| Vidět všechny projekty | ✓ | ✓ | ✓ | jen vlastní (assignee/člen) |
| Vytvořit projekt | ✓ | ✓ | svého odd. + cross | ✗ |
| Editovat projekt | všechny | všechny | svého odd. + cross | ✗ |
| Přidat/editovat úkol | ✓ | ✓ | svého odd. + cross | jen svůj přiřazený |
| Smazat úkol | ✓ | ✓ | svého odd. + cross | ✗ |
| Spravovat uživatele | ✓ | ✗ | ✗ | ✗ |
| Komentovat | tam, kde má přístup k úkolu |

Autoritativní kontrola probíhá vždy serverově v Convex mutations/queries (`convex/lib/permissions.ts`); UI jen skrývá tlačítka.

## Testovací účty (po seed)

| E-mail | Role | Oddělení |
|--------|------|----------|
| `<tvůj e-mail>` | admin | — |
| `pm+test@techmania.cz` | pm | — |
| `it+test@techmania.cz` | department_lead | IT |
| `facility+test@techmania.cz` | department_lead | Facility |
| `vyroba+test@techmania.cz` | department_lead | Výroba |
| `member+test@techmania.cz` | member | IT |

Každý se přihlašuje vlastním magic linkem (URL z konzole Convex dev).

## End-to-end test scénář

1. **Admin** v `/admin/uzivatele` vidí všechny účty, edituje roli a vrátí
2. **Admin** v `/projekty/novy` vytvoří projekt „Rekonstrukce expozice" (cross, deadline +30 dní), vlastník = PM
3. **PM** otevře projekt, přidá 3 root úkoly: Demontáž / Elektro / Montáž; k Demontáž přidá 2 podúkoly
4. **PM** přiřadí Elektro → dept_lead IT, Montáž → dept_lead Facility
5. **Dept_lead IT** vidí jen cross+IT projekty, otevře Elektro, přidá podúkol „Revize", přiřadí membera
6. **Member** na dashboardu vidí „Revize" v Mých úkolech, otevře, komentář „Začínám zítra", status → in_progress
7. **PM** v jiném tabu vidí komentář v real-time bez refreshe
8. **Member** označí done → progress projektu se aktualizuje
9. **Member** zkusí editovat cizí úkol → tlačítko Edit skryté + serverová mutation hodí chybu
10. **Admin** archivuje projekt → mizí z default seznamu, dostupný přes filtr „Archivované"

## Struktura projektu

```
techmania-projects/
├── app/
│   ├── (auth)/prihlaseni/        # magic link login
│   └── (app)/                    # vyžaduje auth (AuthGate)
│       ├── page.tsx              # dashboard
│       ├── projekty/             # list + detail s task tree
│       ├── tym/                  # přehled lidí
│       ├── kalendar/             # V2 placeholder
│       └── admin/uzivatele/      # správa rolí + seed
├── convex/
│   ├── schema.ts                 # datový model
│   ├── auth.ts, auth.config.ts, http.ts  # Convex Auth setup
│   ├── users.ts, projects.ts, tasks.ts, comments.ts
│   ├── seed.ts                   # dev data
│   └── lib/{auth,permissions}.ts # RBAC core
├── components/
│   ├── auth/, layout/            # auth flow + sidebar/navbar
│   ├── projects/, tasks/         # CRUD UI + TaskTree
│   ├── comments/                 # CommentThread (real-time)
│   ├── dashboard/                # MyTasks, UpcomingDeadlines, …
│   └── ui/                       # button, input, badge, drawer …
└── lib/
    ├── constants.ts              # role/dept/status/priority labely
    ├── dates.ts                  # cs locale helpers
    └── utils.ts                  # cn() Tailwind merge
```

České URL slugy (`/projekty`, `/ukol`, `/tym`, `/kalendar`) – fieldy v Convex jsou v EN kvůli codegen.

## Status V1 a co je ve V2

**V1 hotovo:**
- ✅ Magic link login
- ✅ Bootstrap prvního admina
- ✅ Projekty (CRUD, filtry, fulltext)
- ✅ Úkoly + podúkoly (libovolná hloubka, kaskádové mazání)
- ✅ Komentáře (real-time)
- ✅ RBAC (admin / pm / dept_lead / member)
- ✅ Dashboard – Moje úkoly, Termíny, Přehled oddělení
- ✅ Tým, Uživatelé (admin), Seed

**V2 plánováno:**
- ⏳ Přílohy (Convex File Storage)
- ⏳ Závislosti mezi úkoly (blocking / blocked_by)
- ⏳ E-mail notifikace (Resend + Convex cron)
- ⏳ Gantt + kalendářní pohled
- ⏳ PWA + plná mobilní responzivita

## Užitečné příkazy

```bash
npm run dev                   # Next.js dev server (frontend)
npx convex dev                # Convex dev (backend + types + magic link console)
npm run typecheck             # TypeScript bez emitu
npm run lint                  # ESLint
npx convex dashboard          # Otevři Convex dashboard (DB browser, logs)
npx convex env list           # Vypiš Convex env proměnné
```

## Nasazení do produkce

- **[VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md)** — Vercel + Convex Cloud (doporučeno, ~15 min, free tier)
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — vlastní Linux server s veřejnou IP (Caddy + PM2)

## Troubleshooting

**„Convex není nakonfigurován" hláška** – chybí `NEXT_PUBLIC_CONVEX_URL` v `.env.local`. Spusť `npx convex dev` a počkej, až ti URL doplní.

**Magic link není v konzoli** – zkontroluj, že běží `npx convex dev` (ne jen `npm run dev`). Funkce běží v Convex deploymentu, ne v Next.js.

**Po `convex dev` nevidím žádné funkce** – schema/funkce se deplojí automaticky při změně, ale poprvé to může trvat ~10 s. Sleduj výstup `npx convex dev`.
