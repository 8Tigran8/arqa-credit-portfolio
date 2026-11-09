-- Exact duplicate records may be removed. Conflicting business keys are an error,
-- not an arbitrary ROW_NUMBER winner. scripts build checks this BEFORE export.
CREATE OR REPLACE VIEW reporting.v_portfolio_dedup AS
 SELECT DISTINCT * FROM raw.portfolio;
CREATE OR REPLACE VIEW reporting.v_fx AS SELECT DISTINCT * FROM raw.fx;
CREATE OR REPLACE VIEW reporting.v_quality AS
 SELECT 'conflicting_loan_keys' AS check_name, count(*)::bigint AS failures FROM
 (SELECT report_date,loan_id FROM reporting.v_portfolio_dedup
  GROUP BY 1,2 HAVING count(*)>1) t
 UNION ALL SELECT 'conflicting_fx_keys',count(*) FROM
 (SELECT date,currency FROM reporting.v_fx GROUP BY 1,2 HAVING count(*)>1) t
 UNION ALL SELECT 'missing_exact_date_fx',count(*) FROM reporting.v_portfolio_dedup p
 WHERE p.currency<>'KZT' AND NOT EXISTS
 (SELECT 1 FROM reporting.v_fx f WHERE f.date=p.report_date AND f.currency=p.currency);
CREATE OR REPLACE VIEW reporting.v_loans AS
 SELECT p.*, CASE WHEN p.currency='KZT' THEN 1::numeric ELSE f.rate_kzt END AS fx_rate,
 p.principal_outstanding *
 (CASE WHEN p.currency='KZT' THEN 1::numeric ELSE f.rate_kzt END) AS principal_kzt,
 (p.days_past_due>30) AS is_par30, (p.days_past_due>90) AS is_par90,
 (p.days_past_due>90 OR p.restructured=1) AS is_npl,
 CASE WHEN p.days_past_due>90 OR p.restructured=1 THEN 0.50::numeric
      WHEN p.days_past_due>30 THEN 0.10::numeric ELSE 0.01::numeric END AS provision_rate
 FROM reporting.v_portfolio_dedup p LEFT JOIN reporting.v_fx f
 ON f.date=p.report_date AND f.currency=p.currency
 WHERE p.written_off=0;
CREATE OR REPLACE VIEW reporting.v_risk_facts AS
 SELECT *,principal_kzt*is_par30::integer AS par30_kzt,
 principal_kzt*is_par90::integer AS par90_kzt,
 principal_kzt*is_npl::integer AS npl_kzt,
 principal_kzt*provision_rate AS provision_kzt
 FROM reporting.v_loans;
CREATE OR REPLACE VIEW reporting.v_group_exposure AS
 SELECT report_date,group_id,sum(principal_kzt) AS exposure_kzt
 FROM reporting.v_risk_facts GROUP BY 1,2;
CREATE OR REPLACE VIEW reporting.v_group_rank AS
 SELECT *,row_number() OVER
 (PARTITION BY report_date ORDER BY exposure_kzt DESC,group_id) AS exposure_rank
 FROM reporting.v_group_exposure;
CREATE OR REPLACE VIEW reporting.v_metrics AS
 WITH sums AS (
 SELECT report_date,count(*) AS loan_count,sum(principal_kzt) AS portfolio_kzt,
 sum(par30_kzt) AS par30_kzt,sum(par90_kzt) AS par90_kzt,
 sum(npl_kzt) AS npl_kzt,sum(provision_kzt) AS provisions_kzt
 FROM reporting.v_risk_facts GROUP BY 1
 ), top_groups AS (
 SELECT report_date,sum(exposure_kzt) FILTER (WHERE exposure_rank<=10) AS top10_kzt
 FROM reporting.v_group_rank GROUP BY 1
 )
 SELECT s.*,s.par30_kzt/nullif(s.portfolio_kzt,0) AS par30,
 s.par90_kzt/nullif(s.portfolio_kzt,0) AS par90,
 s.npl_kzt/nullif(s.portfolio_kzt,0) AS npl,
 s.provisions_kzt/nullif(s.portfolio_kzt,0) AS provision_coverage,
 t.top10_kzt,t.top10_kzt/nullif(s.portfolio_kzt,0) AS top10_share
 FROM sums s JOIN top_groups t USING(report_date);
CREATE OR REPLACE VIEW reporting.v_metrics_change AS
 SELECT m.*,m.portfolio_kzt-b.portfolio_kzt AS portfolio_change_kzt,
 m.portfolio_kzt/nullif(b.portfolio_kzt,0)-1 AS portfolio_change_pct,
 (m.par30-b.par30)*100 AS par30_change_pp,
 (m.par90-b.par90)*100 AS par90_change_pp,
 (m.npl-b.npl)*100 AS npl_change_pp,
 m.provisions_kzt-b.provisions_kzt AS provisions_change_kzt,
 (m.top10_share-b.top10_share)*100 AS top10_change_pp
 FROM reporting.v_metrics m CROSS JOIN
 (SELECT * FROM reporting.v_metrics WHERE report_date=DATE '2026-09-01') b;
CREATE OR REPLACE VIEW reporting.v_breakdowns AS
 WITH dimensions AS (
 SELECT report_date,'sector'::text AS dimension,sector AS category,
 principal_kzt,par30_kzt,par90_kzt,npl_kzt,provision_kzt FROM reporting.v_risk_facts
 UNION ALL SELECT report_date,'program',program,
 principal_kzt,par30_kzt,par90_kzt,npl_kzt,provision_kzt FROM reporting.v_risk_facts)
 SELECT report_date,dimension,category,sum(principal_kzt) AS portfolio_kzt,
 sum(par30_kzt)/nullif(sum(principal_kzt),0) AS par30,
 sum(par90_kzt)/nullif(sum(principal_kzt),0) AS par90,
 sum(npl_kzt)/nullif(sum(principal_kzt),0) AS npl,
 sum(provision_kzt) AS provisions_kzt FROM dimensions GROUP BY 1,2,3;

