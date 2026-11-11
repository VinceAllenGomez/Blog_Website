# Deploying LiM-iMa

The app already has a local JSON database at `.data/blog-data.json`. For an
online deployment, `render.yaml` configures a Render web service and mounts a
persistent disk at `/var/data`, so database changes survive service restarts.
The Render service and persistent disk may incur monthly charges.

## Deploy to Render

1. Push this project to a GitHub repository. Do not commit `.data/`; it contains
   local account and journal data.
2. In Render, create a **Blueprint** from that repository and apply the
   `render.yaml` configuration.
3. When prompted, set `ADMIN_PASSWORD` to a strong, unique password. Render
   supplies the port automatically; the app listens on it.
4. Open the service URL shown by Render.

The deployed disk starts with a new, empty database and creates the `admin`
account using `ADMIN_PASSWORD`. Existing local posts and accounts in
`.data/blog-data.json` are not copied to the hosted service.

For local development, `npm start` starts the server without nodemon;
`npm run dev` remains available for automatic restarts while editing.
