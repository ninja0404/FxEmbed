# Cloudflare self-host deployment

This fork deploys the official FxEmbed Worker to the Cloudflare account configured in `wrangler.toml`.

Current deployment uses the Wrangler CLI. Git-triggered Workers Builds is not connected. The live instance is https://fxembed-selfhost.dengkang807.workers.dev .

## Optional Workers Builds

- Worker name: `fxembed-selfhost`
- Branch: `main`
- Repository root: `/`
- Build command: `cp .env.selfhost .env && npm run build`
- Deploy command: `npm run deploy`
- Build variable: `NODE_VERSION=24`
- Preview builds: disabled

`.env.selfhost` contains public configuration only. Keep account cookies, credential encryption keys, and API tokens out of Git. Configure sensitive build values through Cloudflare Build variables and secrets; runtime `CREDENTIAL_KEY` belongs in Worker Secrets. Follow the upstream credential encryption guide when adding X accounts.

The Worker uses `workers.dev` and Cloudflare Workers Logs. No Analytics Engine binding is required.

## CLI deployment and logs

Global Wrangler 4.145.0 is installed. The authorized CLI profile stores encrypted credentials with its key in macOS Keychain.

```sh
cp .env.selfhost .env
wrangler deploy --no-bundle
wrangler tail fxembed-selfhost
```

## Local build

```sh
npm ci
cp .env.selfhost .env
npm run build
npm exec wrangler deploy -- --dry-run
```

## Access

Before assigning its hostname to a realm, `workers.dev` exposes all realms by path prefix:

- `/api/2/status/<post-id>`: FxTwitter v2 JSON API (verified with post `20`)
- `/twitter/<username>/status/<post-id>`: rich embeds for supported bot clients
- `/atmosphere/`: multi-provider API

The root page displays the upstream routing instructions. The legacy v1 routes depend on API hostname configuration; use v2 while keeping both API and embed path prefixes available. Set `API_HOST_LIST` to your actual Worker hostname in Cloudflare Build variables if you want the Twitter API directly at the root, then redeploy.

Without X account credentials, the upstream public fetching path has lower rate limits and cannot fetch all content. Validate real public posts after deployment.

Upstream documentation: https://docs.fxembed.com/deployment/
