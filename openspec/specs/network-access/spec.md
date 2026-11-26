# network-access Specification

## Purpose

Lets a deployment limit which client addresses the app serves, so login-free mode stays reachable only from the household's own network.

## Requirements

### Requirement: Only listed IPv4 clients are served
When `RECIPES_ALLOWED_SUBNETS` is set to a space-separated list of IPv4 addresses or CIDRs, the deployed app SHALL serve a request only when its client address is in one of them or in `127.0.0.0/8`, and SHALL answer every other request with 403. This SHALL cover the SPA and `/api` alike.

#### Scenario: Client inside the list
- **GIVEN** `RECIPES_ALLOWED_SUBNETS="192.168.1.0/24"`
- **WHEN** a client at `192.168.1.20` requests `/` or `/api/auth/config`
- **THEN** it is served normally

#### Scenario: Client outside the list
- **GIVEN** `RECIPES_ALLOWED_SUBNETS="192.168.1.0/24"`
- **WHEN** a client at `203.0.113.5` requests `/` or `/api/auth/config`
- **THEN** the response is 403

#### Scenario: IPv6 client
- **GIVEN** `RECIPES_ALLOWED_SUBNETS` is set
- **WHEN** a client with an IPv6 address other than loopback makes any request
- **THEN** the response is 403

### Requirement: The client address comes from the trusted proxy
The address checked SHALL be the client address the reverse proxy reports in `X-Forwarded-For` when the request comes from a trusted private peer, and the peer's own address otherwise, as already used for the login rate limit.

#### Scenario: Behind the proxy
- **GIVEN** `RECIPES_ALLOWED_SUBNETS="192.168.1.0/24"`
- **WHEN** the proxy at a private address forwards a request with `X-Forwarded-For: 203.0.113.5`
- **THEN** the response is 403

### Requirement: No list means no limit
When `RECIPES_ALLOWED_SUBNETS` is unset or blank, the frontend container SHALL serve every client, as before this change.

#### Scenario: Unset
- **GIVEN** `RECIPES_ALLOWED_SUBNETS` is unset
- **WHEN** a client at any address requests `/`
- **THEN** it is served normally

### Requirement: A bad list fails closed
The frontend container SHALL refuse to start when any entry in `RECIPES_ALLOWED_SUBNETS` is not an IPv4 address or IPv4 CIDR, and SHALL log the bad entry.

#### Scenario: Malformed entry
- **GIVEN** `RECIPES_ALLOWED_SUBNETS="192.168.1.0/24 192.168.1"`
- **WHEN** the frontend container starts
- **THEN** it exits with an error naming `192.168.1`

#### Scenario: IPv6 entry
- **GIVEN** `RECIPES_ALLOWED_SUBNETS="fd00::/8"`
- **WHEN** the frontend container starts
- **THEN** it exits with an error naming `fd00::/8`
