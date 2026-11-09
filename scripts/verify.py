import json
from decimal import Decimal as D
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ref=json.loads((ROOT/"outputs/reference.json").read_text())
sql=json.loads((ROOT/"outputs/sql_results.json").read_text())
checked=0
assert len(sql["metrics"])==len(ref["metrics"])
for actual,expected in zip(sql["metrics"],ref["metrics"]):
    assert actual["report_date"]==expected["report_date"]
    for key,value in expected.items():
        if key=="report_date":continue
        a,b=D(str(actual[key])),D(str(value))
        assert abs(a-b)<D("1e-15"),(key,a,b)
        checked+=1
refs={(r["report_date"],r["dimension"],r["category"]):r for r in ref["breakdowns"]}
for actual in sql["breakdowns"]:
    expected=refs[(actual["report_date"],actual["dimension"],actual["category"])]
    for key in ["portfolio_kzt","par30","par90","npl","provisions_kzt"]:
        assert abs(D(str(actual[key]))-D(str(expected[key])))<D("1e-15"),(key,actual,expected)
        checked+=1
assert len(sql["breakdowns"])==len(refs)
# Reconcile every segment back to the whole portfolio, per dimension/date.
for m in sql["metrics"]:
    for dim in ["sector","program"]:
        rows=[r for r in sql["breakdowns"] if r["report_date"]==m["report_date"] and r["dimension"]==dim]
        for key in ["portfolio_kzt","provisions_kzt"]:
            assert sum((D(r[key]) for r in rows),D(0))==D(m[key])
            checked+=1
v=json.loads((ROOT/"outputs/verification.json").read_text())
v.update(independent_decimal_comparisons=checked,independent_decimal_result="PASS",
         exact_duplicate_rows_removed=ref["duplicate_rows_removed"],
         screenshot_verified=False)
(ROOT/"outputs/verification.json").write_text(json.dumps(v,ensure_ascii=False,indent=2)+"\n")
print(json.dumps(dict(independent_decimal_checks=checked,result="PASS")))

