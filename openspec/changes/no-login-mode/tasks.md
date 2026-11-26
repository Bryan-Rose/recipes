# Tasks

## 1. Backend: login-free mode

- [x] 1.1 Add `auth_enabled` and `allowed_subnets` to `Settings` with the startup validator (IPv4 regex plus `IPv4Network(strict=False)`, checked only when `auth_enabled` is false). Verify with tests that constructing `Settings` fails for an unset or blank list, `192.168.1.0/33`, `192.168.1`, `fd00::/8` and `all`, naming the bad entry, and succeeds for `"192.168.1.0/24 10.0.0.5"` and for any list while `auth_enabled` is true
- [x] 1.2 Add `get_or_create_household` to `app/services/users.py` (username `household`, no password, an admin; on a unique-name `IntegrityError`, roll back and select again) and branch `get_current_user` on `auth_enabled`. Verify with tests that `GET /auth/me` without cookies returns `household` with `is_superuser` true, that a second call reuses the same row, that another user's valid session cookie is ignored, and that the insert-race path returns the existing row
- [x] 1.3 Verify with tests that in login-free mode a recipe and an import record the `household` user as creator, that a recipe created earlier by another user keeps its creator
- [x] 1.4 Refuse `POST /auth/password` with 403 in login-free mode. Verify with a test that the household user still has no password afterwards, and that back in login mode `POST /auth/login` as `household` fails like a wrong password
- [x] 1.5 Add `auth_enabled` to `AuthConfig` and `/auth/config`, run `npm run gen:api` and commit `schema.d.ts`. Verify with a test of both values and with `make check` (contract check)
- [x] 1.6 Show that the new tests can fail: break the household branch and the validator in turn, watch the tests fail, restore

## 2. Backend: cross-site guard

- [x] 2.1 Add the HTTP middleware in `app/main.py` that answers 403 to non-GET/HEAD/OPTIONS requests with `Sec-Fetch-Site: cross-site`. Verify with tests that a cross-site `POST /{kind}s/{id}/merge/{into_id}` returns 403 and merges nothing, a cross-site `POST /auth/login` returns 403, and `same-origin`, `same-site`, `none`, a missing header and a cross-site `GET` are handled normally
- [x] 2.2 Confirm `make fuzz` still passes, since Schemathesis sends no `Sec-Fetch-Site`

## 3. Containers: nginx allowlist

- [x] 3.1 Add `frontend/docker-entrypoint.d/40-allowed-subnets.sh` (executable) and copy it in `frontend/Dockerfile`, then include `/etc/nginx/allowed-subnets.conf` at `server` level in `nginx.conf`. Verify by building the image and running it with `RECIPES_ALLOWED_SUBNETS` unset (serves; empty file), `"192.168.1.0/24"` (renders the allow lines, `127.0.0.0/8` and `deny all`), `"192.168.1"` and `"fd00::/8"` (container exits non-zero and logs the entry), and `"300.1.1.1"` (nginx refuses the config and the container exits)
- [x] 3.2 Pass `RECIPES_ALLOWED_SUBNETS: ${RECIPES_ALLOWED_SUBNETS:-}` to the frontend service in both `compose.yml` and `compose.server.example.yml`. Verify with `docker compose config`, which shows the value from `.env` on the frontend

## 4. Frontend

- [x] 4.1 In `App.tsx`, when `auth_enabled` is false, leave out the Users, Account and Sign out links and render NotFound for `/users` and `/account`. Verify with Vitest (MSW config with `auth_enabled: false`) that the app shows without a login page and that the header has no Sign out, Account or Users link. Also verify that the existing login-mode tests still pass with `auth_enabled: true` added to their mocks

## 5. e2e

- [x] 5.1 In `compose.e2e.yml`, set `RECIPES_ALLOWED_SUBNETS` (the tests' `198.18.0.0/16` plus the private ranges) on backend and frontend, and `RECIPES_AUTH_ENABLED: ${RECIPES_E2E_AUTH_ENABLED:-true}` on the backend. Add a spec that sends `X-Forwarded-For: 203.0.113.5` and expects 403 for `/` and `/api/auth/config`. Verify by running `make e2e`
- [x] 5.2 Add `@no-login` journeys: open the app with no login page and no Sign out, Account or Users link; create a recipe through the UI and see it in the list. Change `make e2e` to run the main suite with `--grep-invert @no-login`, recreate the backend with `RECIPES_E2E_AUTH_ENABLED=false`, run `--grep @no-login`, and exit non-zero if either run failed. Verify with `make e2e`, then break the household branch and confirm the `@no-login` step fails

## 6. Docs

- [x] 6.1 Document `RECIPES_AUTH_ENABLED` and `RECIPES_ALLOWED_SUBNETS` in `.env.example` and README. Cover how they combine, the startup refusal, IPv4 only, never listing Docker's ranges, split DNS against hairpin NAT, an Anthropic spend limit, that `household` is a reserved username, and reviewing the Users page after turning logins back on. Verify by reading it against the specs
- [x] 6.2 Update `AGENTS.md`'s Backend auth section (login-free mode, household user, cross-site guard) and the compose-sync note (the frontend now takes `RECIPES_ALLOWED_SUBNETS`). Verify by reading it against the design

## 7. Integration

- [x] 7.1 Run `make check-full` and confirm it passes

## Workflow follow-up

- Open the PR per AGENTS.md, with the `review:deep` label (auth change), and work the review rounds.
- After merging, archive the change with `/openspec-archive-change no-login-mode`.
