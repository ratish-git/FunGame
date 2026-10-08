# Ratish & Sohani — Gender Reveal 🎉

A fun single-page gender reveal party page. Guests enter their name, pop a
balloon 🎈 or scratch a card 🎟️ to reveal **Boy** or **Girl** (with confetti),
and leave a wish. As admin, you set the answer and read everyone's wishes.

- **No build step** — plain HTML/CSS/JS.
- **Shared data** via [Supabase](https://supabase.com) free tier (not DynamoDB).
- **Local fallback** — works offline per-device if Supabase isn't configured
  (but wishes won't be shared across devices in that mode).

## Files

| File                 | Purpose                                         |
| -------------------- | ----------------------------------------------- |
| `index.html`         | Page markup                                     |
| `styles.css`         | Styling                                         |
| `app.js`             | All logic (guest flow, admin, confetti, data)   |
| `config.js`          | **Your** keys & settings — edit before deploy   |
| `supabase-schema.sql`| Run once in Supabase to create the tables       |
| `amplify.yml`        | AWS Amplify build/deploy config                 |

---

## 1. Set up Supabase (shared wishes + answer)

1. Create a free account at <https://supabase.com> and a new project.
2. In the project dashboard open **SQL Editor → New query**, paste the contents
   of `supabase-schema.sql`, and run it. This creates the `settings` and
   `wishes` tables with public read/insert policies.
3. Open **Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
4. Paste both into `config.js`. Also change `ADMIN_PASSWORD`.

> Skipping Supabase? The page still works, but wishes/answer stay on each
> device only — the admin "view all wishes" feature needs Supabase.

## 2. Try it locally

Open `index.html` directly, or serve it:

```powershell
npx serve .
```

Visit the page, run through the guest flow, and click **Admin** (bottom of the
page) to set the answer and view wishes.

## 3. Push to GitLab

```powershell
git add .
git commit -m "Gender reveal page for Ratish & Sohani"
git branch -M main
git remote add origin https://gitlab.com/<your-username>/<your-repo>.git
git push -u origin main
```

## 4. Deploy on AWS Amplify

**Option A — connect GitLab (auto-deploy on every push):**

1. AWS Console → **Amplify** → **Create new app** → **Host web app**.
2. Choose **GitLab**, authorize, pick your repo + `main` branch.
3. Amplify detects `amplify.yml`. Keep defaults and deploy.
4. You get a URL like `https://main.xxxx.amplifyapp.com` — that's your share link.

**Option B — Amplify CLI (manual deploy):**

```powershell
npm install -g @aws-amplify/cli
# then follow Amplify Hosting manual-deploy, zipping this folder
```

Every push to `main` (Option A) rebuilds and redeploys automatically.

---

## How it works for you (admin)

- Open the page, scroll down, click **Admin**, enter your password.
- Pick **It's a Boy** or **It's a Girl** — this sets what every guest reveals.
- Scroll to **Guest wishes** to read messages. Hit **Refresh** for new ones.

Enjoy the celebration! 💕
