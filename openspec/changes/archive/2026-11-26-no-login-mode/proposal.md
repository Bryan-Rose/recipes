# Proposal

## Why

The app is self-hosted for one family on a home network. There, logging in is friction with no matching benefit: every device has to sign in, sessions expire 30 days after login however often the device is used, and the user model only gates access (attribution is stored but never shown). The household wants no logins at all. Logins can't simply be dropped, though: today the session cookie also protects against cross-site requests, and the login is the only thing between strangers and the paid Claude import.

## What Changes

- **Login-free mode.** A new setting, `RECIPES_AUTH_ENABLED` (default `true`, so nothing changes unless it's set). When `false`:
  - Every request acts as one reserved household user (username `household`), an admin with no password, created the first time it's needed.
  - Changing the password is refused, so the household user stays unable to sign in.
  - `/auth/me` returns that user, so the frontend never shows the login page.
  - `/auth/config` reports `auth_enabled: false`, and the frontend hides Sign out, Account and Users.
  - New recipes and imports are attributed to the household user. Existing rows keep their creators. No schema change or migration.
  - Turning the setting back on restores normal logins. The household user has no password, so it can't sign in.
  - **The backend refuses to start** when login-free mode is on and `RECIPES_ALLOWED_SUBNETS` is unset, blank or malformed. The mode is intentional but dangerous, so it can't run without a network limit. The backend already receives the whole `.env` through compose, so it reads the same value nginx does.
- **Cross-site request guard, always on.** The backend rejects state-changing requests (anything but GET, HEAD and OPTIONS) that the browser marks as cross-site (`Sec-Fetch-Site: cross-site`). Requests without that header (curl, scripts, tests) are unaffected. Without a session cookie, this is what stops another website from making a visitor's browser change data. In particular, the lookup merge (`POST /{kind}s/{id}/merge/{into_id}`) has no body, so a plain HTML form on any site could trigger it.
- **Network allowlist in the frontend container's nginx.**
  - A new setting, `RECIPES_ALLOWED_SUBNETS`, takes a space-separated list of IPv4 CIDRs (a bare address counts as `/32`). IPv4 only: an IPv6 entry is an error, and IPv6 clients are always refused.
  - When set, nginx serves only clients in those subnets (and loopback, for healthchecks) and answers everyone else with 403. The check covers the SPA and `/api`, and uses the client address nginx already takes from the proxy's `X-Forwarded-For`.
  - When unset, every client is allowed, as today (the backend's startup check still applies in login-free mode).
  - A malformed entry stops the container from starting rather than opening access.
  - Docker's own address ranges must never be listed: traffic Docker's userland proxy forwards appears to come from them.
  - The setting is passed to the frontend service in both `compose.yml` and `compose.server.example.yml`.
- **Docs.**
  - README and `.env.example` cover both settings and how they're meant to combine (login-free mode plus a subnet list).
  - They also cover split DNS, so LAN clients aren't seen as outside through hairpin NAT, and setting a spend limit in the Anthropic console, since anyone allowed in can run imports.

### Out of scope

- Removing users, sessions, password login or SSO. They stay for deployments that keep logins on.
- Sliding (self-renewing) sessions for login mode.
- Per-person attribution without passwords (a "who's cooking?" picker).
- Filtering by client address in the backend. nginx already knows the real client address, so the filter lives there.

## Capabilities

### New Capabilities
- `authentication`: how a request gets its user, either from a signed-in session or, in login-free mode, the household user; and what the API tells the frontend about the active mode.
- `request-origin-protection`: rejecting state-changing requests that a browser marks as cross-site.
- `network-access`: restricting which client addresses the deployed app serves.

### Modified Capabilities
<!-- None: the project has no specs yet. -->

## Impact

- **Backend:**
  - `app/config.py`: new `auth_enabled` and `allowed_subnets` settings, and the startup check that refuses login-free mode without a valid subnet list.
  - `app/auth.py`: `get_current_user` gains the household branch.
  - `app/main.py`: the cross-site guard as middleware.
  - `app/routers/auth.py` and `app/schemas/auth.py`: `auth_enabled` on `AuthConfig`; password change refused in login-free mode.
  - `app/services/users.py` (or `auth.py`): get-or-create the household user.
  - Tests in `backend/tests/`.
- **Frontend:**
  - `App.tsx`: hide Sign out, Account and Users when `auth_enabled` is false.
  - `api/types` and a regenerated `schema.d.ts`.
  - Vitest coverage.
- **Containers:**
  - `frontend/nginx.conf`: include the generated allow/deny file at `server` level.
  - `frontend/Dockerfile`: add a `/docker-entrypoint.d/` script that renders `RECIPES_ALLOWED_SUBNETS`.
  - `compose.yml` and `compose.server.example.yml`: pass the setting to the frontend service.
- **e2e:**
  - The allowlist is checked in the normal stack: `compose.e2e.yml` sets `RECIPES_ALLOWED_SUBNETS` to the tests' client range plus the private ranges, and one test sends an address outside them and gets 403.
  - Login-free mode gets a second step in `make e2e`: after the main run, the backend is recreated with `RECIPES_AUTH_ENABLED=false` and only the tests tagged `@no-login` run.
- **Fuzzing:** Schemathesis keeps running with logins on. The guard doesn't affect it, because it sends no `Sec-Fetch-Site` header.
- **Docs:** README, `.env.example` and `AGENTS.md` (the auth section and the compose-sync note).
- **Dependencies:** none new.

### Decisions on the earlier open questions

- Login-free mode without a subnet list is a startup error in the backend, not a warning.
- The allowlist is IPv4 only, which sidesteps IPv6 clients appearing as Docker's gateway address. With Caddy in Docker (production) or on the host, nginx already gets the client address from Caddy's `X-Forwarded-For`.
- e2e: the 403 check in the normal run, login-free journeys in a second `make e2e` step.
