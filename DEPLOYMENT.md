# Deploying LiM-iMa on Render and Neon

The Express app runs as a Render web service. Neon PostgreSQL stores production
accounts, posts, comments, and sessions. Local development uses
`.data/blog-data.json` unless `DATABASE_URL` is set.

## Set up Neon

1. Create a free project in [Neon](https://neon.tech/).
2. In the Neon dashboard, copy the pooled connection string from **Connect**.
   Keep it private; it grants access to the database.
3. Use this connection string as the Render `DATABASE_URL` environment value.
   The app creates its state table automatically at startup.

## Deploy to Render

1. Push the repository to GitHub.
2. In [Render](https://render.com/), create a **Blueprint** from the repository
   so Render can apply `render.yaml`. Alternatively, create a Node web service
   manually with this folder as its root directory, `npm ci` as the build
   command, and `npm start` as the start command; select the free plan.
3. In the service's environment settings, add these secret values:
   - `DATABASE_URL`: the Neon pooled connection string
   - `ADMIN_PASSWORD`: a strong, unique password for the `admin` account
4. Deploy. Connect the Render service to the GitHub repository to enable
   automatic deploys from your selected branch.

Do not commit either secret, `.env`, or `.data/`. The service uses PostgreSQL
when `DATABASE_URL` is set and refuses to use local JSON storage in production.
Without `DATABASE_URL`, local development continues to use `.data/blog-data.json`.

## Free-plan limitations

Render's free web service spins down after 15 minutes without traffic and can
take about a minute to wake. Its filesystem is temporary, so production data
must stay in Neon. Neon Free scales database compute to zero after inactivity,
which can also add latency to the first request. These free tiers are suitable
for a hobby or demo site, not an always-on production service.

The app stores its current data model in one PostgreSQL JSONB state row to
preserve the existing account/post/comment behavior. This is appropriate for a
small site; a larger site should move to relational tables.

## Data migration

The new Neon database starts empty. Existing local `.data/blog-data.json` data
is not copied automatically. Export and migrate any entries you want to keep
before switching users to the Render site. Existing Firebase data is not
connected or migrated.

## Local development

Run `npm install` once, then `npm start` to start the site at
`http://localhost:3000`. Run `npm run dev` for automatic restarts while editing.
If `DATABASE_URL` is set locally, the app uses PostgreSQL instead of the local
JSON file.
