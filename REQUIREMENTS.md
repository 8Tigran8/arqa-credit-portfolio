# Raw-brief requirement map
Authority: original public assignment https://jobs.arqa.cc/bi, reviewed 9 November2026. Full source snapshot retained privately for the requirement audit.
| Original requirement | Expected evidence | Visible file / section | Status |
|---|---|---|---|
| PostgreSQL: raw CSV and reporting views | Typed raw tables, idempotent views, repeatable reload | sql/01_schema.sql, sql/02_views.sql; scripts/run_postgres.sh | PASS: PostgreSQL17.5/PGlite; Docker16pathnotrun, disclosed |
| Both report dates and change from01.09 | KZT balance, PAR30/PAR90/NPL, provisions, top10 groups, deltas | reporting.v_metrics_change; dashboard KPI table | PASS: SQL/Decimal/visibleUI |
| YAML model exact source/dimensions/measures contract | model/source, dimensions name/column/type/label, measures name/column/type/format/label | model/portfolio.yaml | Implemented; ratios explicitly outside additive contract |
| Vega-Lite metrics, dynamics, sector/program slices | JSON specs plus static vega-embed HTML | dashboard/*.vl.json, dashboard/index.html | PASS: actual rendered3SVG |
| README run instructions and figures | Reproducible commands and both dates | README.md | PASS: README exact figures and3conclusions |
| Three risk-committee conclusions | Observed quantified findings; no invented causality | README.md | PASS: README exact figures and3conclusions |
| Agent instructions actually used | AGENTS.md and honest error/correction note | AGENTS.md, README.md | PASS: README honest Codex execution note |
| Public repository link | Authorized public GitHub repository | https://github.com/8Tigran8/arqa-credit-portfolio | PASS: published under8Tigran8 afterspecificapproval |
| Dashboard screenshot in README | Screenshot from actual rendered page | dashboard/screenshot.png | PASS: actual rendered3SVG, nohorizontaloverflow |
| How figures were checked | Independent Decimal oracle, SQL comparison, boundaries, quality gates | scripts/reference.py, scripts/build.mjs; outputs/verification.json | PASS:10PostgreSQLscenarios+146Decimalcomparisons |

