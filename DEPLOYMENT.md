# Deploying LiM-iMa

The app stores data in `.data/blog-data.json`. The Render Blueprint uses a free
web service with no persistent disk, so the service may sleep when idle and
database changes can be lost when the service restarts, redeploys, or its
filesystem is replaced. Do not use this setup for data you need to keep.

## Deploy to Render

1. Push this project to a GitHub repository. Do not commit `.data/`; it contains
   local account and journal data.
2. In Render, create a **Blueprint** from that repository and apply the
   `render.yaml` configuration.
3. When prompted, set `ADMIN_PASSWORD` to a strong, unique password. Render
   supplies the port automatically; the app listens on it.
4. Open the service URL shown by Render.

The deployed service starts with a new, empty database and creates the `admin`
account using `ADMIN_PASSWORD`. Existing local posts and accounts in
`.data/blog-data.json` are not copied to the hosted service. Because this free
setup has no persistent disk, hosted posts, accounts, and sessions may be lost
after a restart or redeploy.

For local development, `npm start` starts the server without nodemon;
`npm run dev` remains available for automatic restarts while editing.
