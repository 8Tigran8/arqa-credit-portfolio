#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
name=arqa-credit-assessment-pg16
docker run --detach --rm --name "$name" --memory 256m --cpus 1 \
 --env POSTGRES_PASSWORD=local_synthetic_only \
 --mount "type=bind,source=$PWD/data,target=/data,readonly" postgres:16-alpine >/dev/null
trap 'docker stop "$name" >/dev/null' EXIT
for attempt in {1..30}; do
 if docker exec "$name" pg_isready -U postgres >/dev/null 2>&1; then break; fi
 sleep 1
done
docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 < sql/01_schema.sql
docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
TRUNCATE raw.portfolio,raw.fx;
COPY raw.portfolio FROM '/data/portfolio.csv' CSV HEADER;
COPY raw.fx FROM '/data/fx.csv' CSV HEADER;
COMMIT;
SQL
docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 < sql/02_views.sql
docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM reporting.v_quality WHERE failures>0)
 THEN RAISE EXCEPTION 'Quality gate failed'; END IF;
END $$;
SELECT * FROM reporting.v_metrics_change ORDER BY report_date;
SQL

