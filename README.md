# Paal & Pannai (பால் & பண்ணை)

Offline-first Android app for dairy / livestock / poultry farmers, milk agents, customers and delivery partners.
React Native + Expo SDK 58 (TypeScript, Expo Router), SQLite on the phone, Supabase in the cloud, English + Tamil.

> **Read "What is and is not verified" and "Known limits" before you give this to farmers.**

## Get an APK (about 15 minutes)

You need: Node 20+, a free Expo account.

```bash
npm install
npm install -g eas-cli
eas login
eas init                      # writes your projectId into app.json
eas build -p android --profile preview     # builds an installable .apk in Expo's cloud; you get a download link
```

The app runs **fully offline without any cloud setup** (animals, milk, bills, breeding, feed, reminders, expenses,
weather, QR tags). Cloud is only needed for: backup/sync, marketplace, home-delivery matching, delivery partners and the
AI notebook scanner. Set it up when you are ready:

### 1. Supabase (cloud)
1. Create a project at supabase.com.
2. SQL editor: run `supabase/migrations/0001_tables.sql`, then `supabase/migrations/0002_policies_rpc.sql`.
3. Authentication: enable Email provider. (For testing turn "Confirm email" off.)
4. Put the project URL and **anon** key into EAS (they are safe to ship; Row Level Security protects data):
   ```bash
   eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://YOURREF.supabase.co --environment preview --visibility plaintext
   eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR_ANON_KEY --environment preview --visibility plaintext
   ```
   For local runs copy `.env.example` to `.env`. **Never** put the service_role key or any AI key in the app.

### 2. AI notebook scanner (optional)
```bash
npm i -g supabase
supabase login && supabase link --project-ref YOURREF
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...      # stays on the server
supabase functions deploy ocr-extract
```
The function checks the user is signed in, limits scans per user per day (`OCR_DAILY_LIMIT`, default 30), and returns rows.
The phone never sees the AI key. Model is `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`).

### 3. Maps
Maps use OpenStreetMap through a bundled Leaflet in a WebView, so **no Google Maps key is needed**.
The public OSM tile server is for light use and may block apps. Before a real rollout set `EXPO_PUBLIC_TILE_URL` to a
tile provider you have an account with (see `.env.example`).

### Other build commands
```bash
eas build -p android --profile preview --local   # build on your own machine (needs Android SDK)
eas build -p android --profile production        # .aab for Google Play
eas build -p android --profile development       # dev client with hot reload, then: npx expo start --dev-client
```

## What is and is not verified

I could not build an APK or run a phone/emulator in the environment this was written in. So:

| Verified by running it | Not verified (you must test on a phone) |
|---|---|
| `tsc --noEmit` clean (strict) | The APK build itself (`eas build`) |
| **114 tests** (`npm test`): all calculators, SQLite schema + repo, the **sync engine** (offline, conflicts, tombstones, paging, account switch), and the **Postgres security model** | Screens on a real device: layout, keyboard, fonts, Tamil rendering |
| Full Android Metro bundle compiles to Hermes bytecode (`expo export`) | Notifications actually ringing (battery savers on some phones delay them) |
| Both SQL migrations execute on real Postgres; RLS + geofence RPCs attacked as 6 different users | A real Supabase project, real email sign-up |
| 1,162 UI strings all have Tamil (`npm run i18n:check`) | The AI scanner with real handwriting (accuracy unknown) |
| Sync tests were mutation-checked (breaking the guards makes tests fail) | OpenStreetMap tiles loading in the WebView |

`npm run verify` runs typecheck + tests + translation check.

## What the code does, by your 10 modules

| # | Module | Where |
|---|---|---|
| 1 | Animal profiles, species, tape-measure weight, health, mortality | `app/(tabs)/animals.tsx`, `app/animal/*`, `src/lib/weight.ts` |
| 2 | Feed + maize calculator, reminders, GPS pasture alerts | `app/care/*`, `src/lib/feed.ts`, `src/services/notifications.ts` |
| 3 | Heat (Paruvam), Oosi/natural, conception check, next-heat alert, fees, vets/semen directory + booking, goat and poultry parity | `app/breeding/*`, `src/lib/breeding.ts`, `src/services/alerts.ts` |
| 4 | Milk entry (cow / herd / farm), fat+SNF rates, buyers, comparison, Society vs private | `app/(tabs)/milk.tsx`, `app/milk/*`, `src/lib/milk.ts` |
| 5 | Bills (daily, weekly, 10-day, 15-day, monthly), cash/bank/UPI/QR, missing-amount queries | `app/billing/*`, `src/lib/billing.ts` |
| 6 | Marketplace with the 4 flows | `app/(tabs)/market.tsx`, `app/market/*` |
| 7 | Radius-limited delivery, subscriptions + add-ons, route order, partner live tracking | `app/delivery/*`, `supabase/migrations/0002_*.sql` |
| 8 | Expenses, P&L per animal and farm, savings, schemes + eligibility | `app/finance/*`, `src/lib/finance.ts`, `src/data/schemes.ts` |
| 9 | AI paper-notebook scanner | `app/scan/*`, `src/services/ocr.ts`, `supabase/functions/ocr-extract` |
| 10 | Weather + heat-stress/rain alerts, QR ear tags, PDF/WhatsApp share, auto sync | `app/weather.tsx`, `app/qr.tsx`, `app/animal/qr.tsx`, `src/services/share.ts`, `src/services/sync.ts` |

## How it is built

```
app/                 screens (Expo Router file routes)
src/db/registry.ts   ONE list of tables. Generates the SQLite schema AND supabase/migrations/0001_tables.sql
src/db/repo.ts       typed CRUD, soft delete, dirty tracking
src/services/sync.ts offline-first sync (push dirty, pull since cursor)
src/lib/*            pure, tested logic (money, dates, feed, milk, breeding, billing, finance, geo, weather)
src/i18n/            English text is the key; Tamil in src/i18n/ta/*.json
supabase/            migrations, edge function
tests/               vitest: logic, sync, and Postgres security tests
```

* Change a table: edit `src/db/registry.ts`, run `npm run gen:sql`, apply the new SQL in Supabase. Installed phones add new columns automatically.
* Add a string: use `t('English text')`, add the Tamil to the newest `src/i18n/ta/p*.json`, run `npm run i18n:check`.
* All money goes through integer paise (`src/lib/money.ts`). "Today" is the **local** date (UTC would be wrong for milking before 5:30 am in India).

### Sync rules (simple on purpose)
Every local write marks the row dirty. Sync pushes dirty rows, then pulls rows newer than a server cursor. If the same row has
unsynced edits on this phone, **this phone wins** and overwrites the cloud. Deletes are tombstones. Server time (not the phone
clock) drives pulls, so a wrong phone date cannot hide data. Signing in with a different account on the same phone is refused
until the phone data is cleared, so two people's farms never merge.

### Security model
* Every synced table is owner-only (Row Level Security). Other users never read your rows directly.
* Anything shared goes through `SECURITY DEFINER` functions that return only safe fields.
* **The delivery radius is enforced in the database** (`farms_in_range`, `place_subscription`). A customer outside the radius
  cannot see the farm and cannot place an order even with a modified app. The farm's exact coordinates are never returned.
  This is proven in `tests/sql.test.ts`.
* Price and owner of an order are set by the server, not the caller.
* AI key lives only in the edge function. Scans are limited per user per day.

## Known limits (be honest with farmers and yourself)

1. **Pasture alerts follow the phone, not the cow.** The app cannot know where an animal is unless you pin the new spot. Real
   tracking needs GPS collars. The screen also warns when the phone is far from the last saved place.
2. **Partner live location works while the partner screen is open** (foreground only). Background tracking needs a foreground
   service and a Google Play location declaration.
3. **Vet/dealer "booking" is a request**, because those people are not app users. It sends WhatsApp and you mark it confirmed.
4. **Government schemes are indicative and marked unverified.** Rules change. Correct them without a new APK by inserting rows
   in the Supabase `schemes` table (same JSON as `src/data/schemes.ts`). Someone must check each against the current order.
5. **Feed and weight formulas are rule-of-thumb** (tape weight is usually within 5-10%, adults only). Shown as guidance, not
   prescriptions. Have a livestock vet review the numbers before you promise anything.
6. **Milk rates are user-entered.** Nothing is hard-coded as an "official Aavin rate". The society screen helps copy a real rate card.
7. **Marketplace has no payments, escrow, reporting or moderation.** A seller's phone number is visible to every signed-in user.
   Selling live animals can have local transport/health-certificate rules. Think about abuse before a public launch.
8. **Two phones editing the same record offline**: the one that syncs last wins for that record. A second phone that onboards
   separately can create a second farm profile (the oldest is used).
9. **AI scanner accuracy is unknown on real handwriting.** It always goes through a review screen; impossible values (fat > 15, etc.)
   are dropped. It costs money per scan. Watch usage.
10. **Email + password login.** Phone OTP suits farmers better but needs an SMS provider (cost + DLT registration in India).
11. **Tamil text was written by an AI, not a native reviewer.** Have a Tamil-speaking farmer or vet read every screen,
    especially medical wording and the scheme text.
12. App icon is a placeholder (`npm run gen:assets`). Replace before Play Store.
13. JSON backup (Settings) is the only backup for users who never sign in.
