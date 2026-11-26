# Design

## Context

See proposal.md for why. The current state:

- `get_current_user` (`app/auth.py`) is the only place a request gets its user. Every router except `/auth` depends on it through `signed_in` in `app/main.py`, and recipes and imports take their creator from it.
- `require_admin` gates only `/users`, so admin rights matter only there.
- `POST /auth/password` reads `request.cookies[SESSION_COOKIE]` to keep the current session while revoking the others.
- Settings are read once (`get_settings()` is `lru_cache`d) and `app/main.py` calls it at import, so a settings error stops uvicorn before it serves anything.
- nginx (`frontend/nginx.conf`) already sets `$remote_addr` to the client address from `X-Forwarded-For` when the peer is private (`set_real_ip_from` the private ranges). The login rate limit uses that address.
- Both compose files pass the repo-root `.env` to the backend through `env_file`, and pass nothing to the frontend.
- e2e: `compose.e2e.yml` resets the backend's `env_file` and sets its environment explicitly. Tests send a made-up `X-Forwarded-For` in `198.18.0.0/16` per test, and `make e2e` runs Playwright once.

## Goals / Non-Goals

**Goals:**
- Login-free mode is one branch in `get_current_user`, so every route, attribution included, follows it without per-route changes.
- Every way the setup can be wrong fails closed: no subnet list, a malformed entry, an IPv6 entry.

**Non-Goals:**
- Hiding or disabling `/auth/login`, `/auth/logout` or OIDC in login-free mode. They still work, but the session they create is ignored, so they have no effect. The cross-site guard covers them like every other write.
- Any database change.

## Decisions

### Household user: looked up by username, created on demand, an admin
`get_current_user` takes `Settings`. When `auth_enabled` is false it skips the cookie and returns `users.get_or_create_household(db)`, which selects the user named `household` and otherwise inserts one with no password and `is_superuser=True`. If two first requests race, the unique username makes one insert fail. That one rolls back and selects again, so it doesn't surface as the app-wide 409.

- **An admin**, as the household owns the whole install. The frontend still hides Users in this mode (see Frontend), but `/users` stays open to API calls; see Risks.
- **Alternatives:** a fixed id (fragile across databases); a row created by migration (a schema change for something only this mode needs); a `household` flag column (a migration for no gain). The username is reserved by convention only; the docs say so.

### Password change refused in login-free mode
`POST /auth/password` checks `settings.auth_enabled` first and answers 403 "Logins are turned off". Without this, the household user, which has no password, could set one with no current password and could then sign in after logins come back on. As written, the route would also fail with a `KeyError` (a 500), because no session cookie is required.

### Startup check in `Settings`
Two new fields: `auth_enabled: bool = True` and `allowed_subnets: str = ""`. A `model_validator(mode="after")` checks the list only when `auth_enabled` is false.

- **Format check:** each whitespace-separated entry must match `^\d{1,3}(\.\d{1,3}){3}(/\d{1,2})?$` and then parse with `ipaddress.IPv4Network(entry, strict=False)`. The regex shuts out forms nginx reads differently, such as netmask notation and `all`. `strict=False` matches nginx, which accepts host bits.
- **Failure:** the validator raises with the setting name and the bad entry. Because `main.py` builds the settings at import, uvicorn exits.
- **Tests:** they build `Settings(...)` directly for overrides, so the validator is unit-tested the same way.
- **Alternative:** a check in the frontend container only. Rejected, because the backend is what decides whether logins are on, and a backend started any other way (uvicorn by hand, another compose file) would otherwise run unguarded.

### Cross-site guard as HTTP middleware
A small `@app.middleware("http")` in `app/main.py` returns 403 JSON (`{"detail": "Cross-site request refused"}`) when the method isn't GET, HEAD or OPTIONS and `Sec-Fetch-Site` is `cross-site`. Middleware rather than a dependency, so it covers `/auth` and any router added later without anyone remembering to add it.

- **Why `cross-site` only:** `same-site` is allowed, because a sibling subdomain on the same household domain isn't the threat here.
- **Alternatives:** an `Origin` check (needs the public origin configured, and differs behind the proxy); a CSRF token (frontend and backend work for little gain over Fetch Metadata).

### nginx allowlist rendered at container start
- **The script:** `frontend/docker-entrypoint.d/40-allowed-subnets.sh` is copied into the image's `/docker-entrypoint.d/`. It writes `/etc/nginx/allowed-subnets.conf`:
  - unset or blank: an empty file (no limit);
  - otherwise: one `allow <entry>;` per entry, then `allow 127.0.0.0/8;` and `deny all;`.
- **Validation:** each entry must match the same IPv4 regex as the backend (`grep -Eq`), or the script prints the entry and exits 1. The image's entrypoint stops on a failing script, so the container exits; task 3.1 confirms this on the pinned `nginx:1.28-alpine`. Out-of-range octets or prefixes pass the regex but fail `nginx` config parsing, which also stops the container.
- **IPv6:** `deny all` refuses every IPv6 client without any IPv6 rule.
- **Where it's included:** `nginx.conf` includes the file at `server` level, after the `real_ip` directives. No location sets its own `allow` or `deny`, so all of them inherit it. nginx's access phase runs after realip, so the check sees the client address.
- **Compose:** both compose files give the frontend `environment: RECIPES_ALLOWED_SUBNETS: ${RECIPES_ALLOWED_SUBNETS:-}`, read from the same `.env` the backend gets.
- **Alternative:** `envsubst` templates (the image's `/etc/nginx/templates`). They can't loop over entries or validate them.

### Frontend
`App.tsx` already reads `useAuthConfig()`. When `auth_enabled` is false it leaves out the Users, Account and Sign out links, and `/users` and `/account` render NotFound. The login page never shows, because `/auth/me` succeeds. `npm run gen:api` picks up the new `AuthConfig` field.

### e2e
`compose.e2e.yml`:
- sets `RECIPES_ALLOWED_SUBNETS: "198.18.0.0/16 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16"` on both backend and frontend. The tests' own range, plus the Docker ranges, so the runner's contexts that send no `X-Forwarded-For` still get in.
- sets `RECIPES_AUTH_ENABLED: ${RECIPES_E2E_AUTH_ENABLED:-true}` on the backend.

A new spec sends `X-Forwarded-For: 203.0.113.5` and expects 403 for `/` and `/api/auth/config`.

Login-free tests carry Playwright's `{ tag: '@no-login' }`. `make e2e`:
1. runs the main suite with `--grep-invert @no-login`;
2. recreates only the backend with `RECIPES_E2E_AUTH_ENABLED=false` (`up -d --wait --force-recreate backend`), which gives a fresh tmpfs database;
3. runs `--grep @no-login`;
4. takes the stack down and exits non-zero if either run failed.

nginx resolves `backend` per request, so the recreated container is picked up.

## Risks / Trade-offs

- **Anyone on the allowed network has full access**, guests on the Wi-Fi included, and can run paid imports. → This is the mode's point. The docs recommend an Anthropic spend limit and listing only the subnet the household uses.
- **Listing a Docker range opens the app to everything Docker's userland proxy forwards**, because that traffic appears to come from the bridge gateway. → The docs warn against it. e2e lists those ranges only because its stack is private.
- **Hairpin NAT makes LAN clients appear as the router's address.** → The docs cover split DNS. The router's LAN address is usually inside the listed subnet anyway.
- **A browser that doesn't send `Sec-Fetch-Site` gets no cross-site protection.** All current major browsers send it. → Accepted. The subnet limit still applies.
- **Anyone allowed in is an admin through the API**, so they can create users with passwords, or set a password on `household` through `PATCH /users/{id}`, and those accounts work once logins are back on. → Accepted with the mode. The docs say to review the Users page after turning logins back on.
- **A real account named `household` would be used as the household user.** → The docs mark the name as reserved. If that account is an admin, login-free requests get admin rights.
- **Leftover sessions from login mode stay in `user_sessions`.** They're ignored while the mode is on and valid again when it's off, until they expire. → Accepted. They belong to real users.

## Migration Plan

No database migration. Deploying with neither setting changes nothing (logins on, no allowlist). To switch:
1. set `RECIPES_ALLOWED_SUBNETS` and `RECIPES_AUTH_ENABLED=false` in `.env`;
2. run `docker compose up -d` so both containers pick them up.

To roll back, set `RECIPES_AUTH_ENABLED=true`, or remove it, and restart. The household user stays in the database, unable to sign in.
