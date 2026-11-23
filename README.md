# LokalBites Mobile

LokalBites is an installable farm-to-market PWA with a plain HTML, CSS, and
JavaScript frontend, a Node.js API, and Supabase for catalog, accounts, and orders.
Checkout uses demo payments. The app does not charge money.

## Deploy to Vercel from GitHub

1. Apply the deployment changes to the `gelica04/LokalBites` repository. The
   app lives in the inner `lokalbites-mobile` directory, alongside
   `package.json`, `vercel.json`, `public/`, and `api/`. Push the changes
   to the branch Vercel deploys. The repository's default branch is `main`.
2. In the **existing LokalBites Supabase project**, open **SQL Editor** and run
   the contents of `supabase-auth.sql` once. The migration adds private
   credentials and an atomic registration function. It requires the existing
   `public.users` table with unique `email` values. The rest of the app uses
   the existing `products`, `orders`, and `order_items` tables, plus the
   `place_lokalbites_order` and `update_lokalbites_order_status` database
   functions. The original archive did not include SQL for those objects.
3. In Vercel, choose **Add New → Project** and import `gelica04/LokalBites`,
   or open the existing project for this repository. Use these settings.

   | Setting | Value |
   | --- | --- |
   | Root Directory | `lokalbites-mobile` |
   | Framework Preset | Other |
   | Node.js Version | 24.x |
   | Install Command | Default or `npm ci` |
   | Build Command | Leave empty |
   | Output Directory | `public`, set by `vercel.json` |

4. Add the variables below to the project's **Environment Variables**.
   Select **Production**. Select **Preview** too if you want preview URLs to
   run against the database assigned to that environment.

   | Name | Value |
   | --- | --- |
   | `SUPABASE_URL` | Supabase project URL |
   | `SUPABASE_SECRET_KEY` | Supabase server-side secret key from the same project |
   | `APP_SECRET` | A new random signing secret of at least 32 characters |
   | `GROQ_API_KEY` | Groq API key, optional for the AI chat |

   Generate `APP_SECRET` locally in PowerShell with Node.js.

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Enter the result directly in Vercel. Keep `.env` out of GitHub.
5. Select **Deploy** or **Redeploy** after saving the variables. Open the URL
   from Vercel and check `/api/health` for `{"ok":true}`. Then open
   `/api/products` and confirm it lists your products. Register a demo customer,
   sign out, sign back in, and place a demo order if you are using test data.

## Farmer and existing accounts

For a farmer account, register with a private password and promote that specific
account in the Supabase SQL Editor. Replace the example address before running it.

```sql
update public.users
set role = 'farmer'
where email = 'your-farmer@example.com';
```

For earlier accounts whose password hashes still live in your original local
`data.json`, save a backup of the file and run `npm.cmd run migrate:users`
from the app folder after running the SQL migration. The command needs a local
`.env` for the matching Supabase project. It imports credentials only when
the email and legacy ID match, skips the old demo accounts, and preserves any
credentials already stored in Supabase. Without the original password hashes,
the profile still exists but cannot sign in with the old password.

## Run locally on Windows

Open the app folder that contains `package.json`. Install Node.js 24. Copy
`.env.example` to `.env`, fill in the values above, and use a test database
if you plan to place orders. Run these commands in PowerShell.

```powershell
npm.cmd ci
npm.cmd start
```

Open `http://localhost:3000`. Run `npm.cmd test` to test the local API with a
mock Supabase server. The test does not read or write the live database.
