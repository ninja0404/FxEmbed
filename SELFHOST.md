# Cloudflare self-host deployment

This fork deploys the official FxEmbed Worker to the Cloudflare account configured in `wrangler.toml`.

Git-triggered Cloudflare Workers Builds is connected to this fork. Pushes and merges to `main` automatically build and publish `fxembed-selfhost`. The live instance is https://fxembed-selfhost.dengkang807.workers.dev .

Modify the source, run appropriate local checks, then push to `main`. Inspect the build result in Cloudflare Worker → Deployments. A commit only counts as released after its build and deployment succeed.

## Workers Builds

- Worker name: `fxembed-selfhost`
- Branch: `main`
- Repository root: `/`
- Build command: `cp .env.selfhost .env && npm run build`
- Deploy command: `npm run deploy`
- Build variable: `NODE_VERSION=24`
- Build secret: `FXEMBED_ENCRYPTED_CREDENTIALS`, the JSON contents of `credentials.enc.json`
- Preview builds: disabled
- Deployment token: `fxembed-workers-builds`, managed by Cloudflare

The `x-powered-by` response header contains the build commit. Use it to verify that the live Worker serves the expected Git revision.

`.env.selfhost` contains public configuration only. Keep account cookies, credential encryption keys, and API tokens out of Git. Configure sensitive build values through Cloudflare Build variables and secrets; runtime `CREDENTIAL_KEY` belongs in Worker Secrets. Follow the upstream credential encryption guide when adding X accounts.

The build reads encrypted credentials from `FXEMBED_ENCRYPTED_CREDENTIALS` when set, otherwise from the local `credentials.enc.json` file. Configure the matching `CREDENTIAL_KEY` runtime secret before deploying. An invalid or empty build secret fails the build instead of publishing a guest-only bundle.

For account pools larger than Cloudflare Builds' 5 KB per-secret limit, split the encrypted JSON into fragments of at most 4,000 bytes. Store the first fragment in `FXEMBED_ENCRYPTED_CREDENTIALS` and the rest in consecutive secrets `_1`, `_2`, etc. Missing, empty, or incorrectly numbered fragments fail the build. Never store the decryption key in build variables.

## Account status page

Open `/admin/accounts` and enter the `ACCOUNT_ADMIN_TOKEN` runtime secret. Sessions use signed, Secure, HttpOnly cookies and expire after eight hours. The page supports username/status filters, individual checks, and a full-pool check with two concurrent requests. Credentials are never returned to the browser.

Each check pins the requested account and makes one authenticated X search request, without retrying on a different account. The page distinguishes a verified login session from a verified query, expired authentication, account restrictions, rate limits, and upstream errors. Results and check times are stored in the `ACCOUNT_HEALTH` KV binding and survive deployments. Results describe the most recent check, not a guarantee of future availability.

The admin routes bypass public caching, request logging, and Sentry request capture. This page reports account health; the existing query proxy retains its account rotation behavior.

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
