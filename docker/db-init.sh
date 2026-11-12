#!/bin/bash
# Runs once, the first time the database container starts with an empty volume.
# It loads the schema, data, routines, and creates the two application accounts
# with passwords taken from the environment.
set -euo pipefail
shopt -u patsub_replacement 2>/dev/null || true   # keep '&' literal in passwords

ROOT_PW="${MARIADB_ROOT_PASSWORD:-}"
: "${SIS_ADMIN_PASSWORD:?SIS_ADMIN_PASSWORD is not set}"
: "${SIS_LECTURER_PASSWORD:?SIS_LECTURER_PASSWORD is not set}"

for pw in "$SIS_ADMIN_PASSWORD" "$SIS_LECTURER_PASSWORD"; do
    case "$pw" in
        *"'"* | *'\'* ) echo "Database passwords must not contain ' or \\ characters." >&2; exit 1 ;;
    esac
done

CLIENT="$(command -v mariadb || command -v mysql)"
run() { "$CLIENT" -uroot -p"$ROOT_PW" "$@"; }

if [ "${LOAD_SAMPLE_DATA:-1}" = "1" ]; then DATA=02_sample_data; else DATA=02_minimal_data; fi

echo "Loading schema, data ($DATA) and routines"
run < /sql/01_schema.sql
run < /sql/$DATA.sql
run < /sql/03_triggers_procedures_views.sql

echo "Creating application accounts"
sql="$(cat /sql/04_security.sql)"
sql="${sql//\'localhost\'/\'%\'}"                       # the web container connects over the network
sql="${sql//Admin@Sis2026/$SIS_ADMIN_PASSWORD}"
sql="${sql//Lect@Sis2026/$SIS_LECTURER_PASSWORD}"
printf '%s\n' "$sql" | run > /dev/null

echo "Database initialised"
