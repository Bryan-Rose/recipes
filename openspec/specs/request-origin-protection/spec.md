# request-origin-protection Specification

## Purpose

Stops other websites from making a visitor's browser change data in the app, which matters most in login-free mode, where no session cookie stands in the way.

## Requirements

### Requirement: Cross-site writes are rejected
The backend SHALL answer 403, without running the route, any request whose method is not GET, HEAD or OPTIONS and whose `Sec-Fetch-Site` header is `cross-site`. This SHALL apply in both login and login-free mode, on every route including `/auth`.

#### Scenario: Cross-site form post
- **WHEN** a `POST /ingredients/1/merge/2` arrives with `Sec-Fetch-Site: cross-site`
- **THEN** the response is 403 and nothing is merged

#### Scenario: Cross-site login attempt
- **WHEN** a `POST /auth/login` arrives with `Sec-Fetch-Site: cross-site`
- **THEN** the response is 403

### Requirement: Same-origin and header-less requests pass
Requests with `Sec-Fetch-Site` set to `same-origin`, `same-site` or `none`, requests without the header, and safe methods with any value SHALL be handled as before.

#### Scenario: The app's own request
- **WHEN** a `POST /recipes/` arrives with `Sec-Fetch-Site: same-origin`
- **THEN** it is handled normally

#### Scenario: Script without the header
- **WHEN** a `DELETE /tags/1` arrives with no `Sec-Fetch-Site` header
- **THEN** it is handled normally

#### Scenario: Cross-site read
- **WHEN** a `GET /recipes/` arrives with `Sec-Fetch-Site: cross-site`
- **THEN** it is handled normally
