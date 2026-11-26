# authentication Specification

## Purpose

Defines how each API request gets the user it acts as, either from a signed-in session or, in login-free mode, a shared household user, and what the API tells the frontend about the active mode.

## Requirements

### Requirement: Login mode is the default
The system SHALL require a signed-in session on every route except `/auth` unless `RECIPES_AUTH_ENABLED` is set to `false`. Leaving the setting unset SHALL behave exactly as before this change.

#### Scenario: Setting unset
- **GIVEN** `RECIPES_AUTH_ENABLED` is not set
- **WHEN** a request without a session cookie calls `GET /recipes/`
- **THEN** the response is 401

#### Scenario: Signed-in request in login mode
- **GIVEN** login mode
- **WHEN** a request with a valid session cookie calls `GET /auth/me`
- **THEN** the response is that session's user

### Requirement: Login-free requests act as the household user
In login-free mode (`RECIPES_AUTH_ENABLED=false`) every request SHALL act as one reserved user with username `household`, whatever cookies it carries. The system SHALL create that user on first need, as an admin with no password.

#### Scenario: First request creates the household user
- **GIVEN** login-free mode and no user named `household`
- **WHEN** a request without cookies calls `GET /auth/me`
- **THEN** the response is 200 with username `household` and `is_superuser` true
- **AND** exactly one `household` user exists afterwards

#### Scenario: Session cookie is ignored
- **GIVEN** login-free mode and a valid session cookie for another user
- **WHEN** the request calls `GET /auth/me`
- **THEN** the response is the `household` user

#### Scenario: Concurrent first requests
- **GIVEN** login-free mode and no user named `household`
- **WHEN** two requests arrive at the same time
- **THEN** both succeed and only one `household` user exists

### Requirement: Login-free writes are attributed to the household user
In login-free mode, recipes and imports created SHALL record the household user as their creator. Rows created earlier SHALL keep their creators.

#### Scenario: New recipe
- **GIVEN** login-free mode
- **WHEN** a request creates a recipe
- **THEN** the recipe's creator is the `household` user

#### Scenario: Existing recipe
- **GIVEN** a recipe created by user `cook` before login-free mode was turned on
- **WHEN** it is read in login-free mode
- **THEN** its creator is still `cook`

### Requirement: Login-free mode refuses password changes
In login-free mode, changing the password SHALL be refused with 403, so the household user does not get a password through its own account.

#### Scenario: Password change
- **GIVEN** login-free mode
- **WHEN** a request calls `POST /auth/password` with a valid new password
- **THEN** the response is 403 and the household user still has no password

### Requirement: Returning to login mode
When `RECIPES_AUTH_ENABLED` is turned back on, normal logins SHALL apply again and the household user SHALL NOT be able to sign in.

#### Scenario: Household user cannot sign in
- **GIVEN** login mode, and a `household` user left over from login-free mode
- **WHEN** a request calls `POST /auth/login` as `household` with any password
- **THEN** the response is the same failure as for a wrong password

### Requirement: Login-free mode needs a subnet list
The backend SHALL refuse to start in login-free mode when `RECIPES_ALLOWED_SUBNETS` is unset, blank, or holds any entry that is not an IPv4 address or IPv4 CIDR, and SHALL say which setting is wrong.

#### Scenario: No subnet list
- **GIVEN** `RECIPES_AUTH_ENABLED=false` and `RECIPES_ALLOWED_SUBNETS` unset or blank
- **WHEN** the backend starts
- **THEN** it exits with an error naming `RECIPES_ALLOWED_SUBNETS`

#### Scenario: Malformed or IPv6 entry
- **GIVEN** `RECIPES_AUTH_ENABLED=false` and `RECIPES_ALLOWED_SUBNETS` containing `192.168.1.0/33` or `fd00::/8`
- **WHEN** the backend starts
- **THEN** it exits with an error naming the bad entry

#### Scenario: Valid list
- **GIVEN** `RECIPES_AUTH_ENABLED=false` and `RECIPES_ALLOWED_SUBNETS="192.168.1.0/24 10.0.0.5"`
- **WHEN** the backend starts
- **THEN** it starts and serves requests as the household user

### Requirement: The API reports the active mode
`GET /auth/config` SHALL include `auth_enabled`, true in login mode and false in login-free mode, and SHALL stay reachable without a session.

#### Scenario: Config in login-free mode
- **GIVEN** login-free mode
- **WHEN** a request calls `GET /auth/config`
- **THEN** the response includes `auth_enabled: false`

### Requirement: Frontend in login-free mode
In login-free mode the frontend SHALL NOT show the login page, Sign out, Account or Users.

#### Scenario: Opening the app
- **GIVEN** login-free mode
- **WHEN** a browser opens the app
- **THEN** the recipe list shows without a login page
- **AND** the header has no Sign out, Account or Users link
