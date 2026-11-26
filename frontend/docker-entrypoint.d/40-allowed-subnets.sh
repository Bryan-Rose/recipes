#!/bin/sh
# Renders RECIPES_ALLOWED_SUBNETS (space-separated IPv4 addresses or CIDRs) into the allow list
# nginx.conf includes. Unset or blank: no limit. A bad entry stops the container (the image's
# entrypoint runs with set -e) rather than opening access.
set -euf  # -f: no globbing when splitting the list

out=/etc/nginx/allowed-subnets.conf
: > "$out"
[ -z "$(echo "${RECIPES_ALLOWED_SUBNETS:-}" | tr -d '[:space:]')" ] && exit 0

for entry in $RECIPES_ALLOWED_SUBNETS; do
    # Same pattern as the backend's check (app/config.py). nginx itself rejects octets over 255.
    if ! echo "$entry" | grep -Eqx '[0-9]{1,3}(\.[0-9]{1,3}){3}(/[0-9]{1,2})?'; then
        echo "RECIPES_ALLOWED_SUBNETS: '$entry' is not an IPv4 address or CIDR" >&2
        exit 1
    fi
    echo "allow $entry;" >> "$out"
done
# Loopback for checks from inside the container. Everything else, IPv6 included, is refused.
printf 'allow 127.0.0.0/8;\ndeny all;\n' >> "$out"
echo "$0: serving only $RECIPES_ALLOWED_SUBNETS"
