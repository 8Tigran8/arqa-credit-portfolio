import csv, json, hashlib
from decimal import Decimal as D, getcontext
from pathlib import Path
from collections import defaultdict
getcontext().prec = 40
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs"
OUT.mkdir(exist_ok=True)
raw = list(csv.DictReader((ROOT/"data/portfolio.csv").open()))
unique = {tuple(r.items()): r for r in raw}
rows = list(unique.values())
keyed = defaultdict(list)
for r in rows: keyed[r["report_date"], r["loan_id"]].append(r)
assert all(len(v)==1 for v in keyed.values()), "Conflicting loan keys"
fx = {}
for r in csv.DictReader((ROOT/"data/fx.csv").open()):
    key = (r["date"],r["currency"])
    rate = D(r["rate_kzt"])
    assert rate > 0 and (key not in fx or fx[key]==rate)
    fx[key] = rate
facts = []
for r in rows:
    if r["written_off"]=="1": continue
    date, ccy = r["report_date"],r["currency"]
    amount = D(r["principal_outstanding"]) * (D(1) if ccy=="KZT" else fx[date,ccy])
    dpd = int(r["days_past_due"]); npl = dpd>90 or r["restructured"]=="1"
    provision = amount * (D(".5") if npl else D(".1") if dpd>30 else D(".01"))
    facts.append(dict(r, amount=amount, p30=amount if dpd>30 else D(0),
                      p90=amount if dpd>90 else D(0), npl_amount=amount if npl else D(0),
                      provision=provision))
def aggregate(items):
    total = sum((r["amount"] for r in items),D(0))
    return dict(loan_count=len(items),portfolio_kzt=total,
        par30_kzt=sum((r["p30"] for r in items),D(0)),
        par90_kzt=sum((r["p90"] for r in items),D(0)),
        npl_kzt=sum((r["npl_amount"] for r in items),D(0)),
        provisions_kzt=sum((r["provision"] for r in items),D(0)))
metrics=[];breakdowns=[]
for date in sorted({r["report_date"] for r in facts}):
    selected=[r for r in facts if r["report_date"]==date]
    m=dict(report_date=date,**aggregate(selected)); total=m["portfolio_kzt"]
    for k,num in [("par30","par30_kzt"),("par90","par90_kzt"),("npl","npl_kzt"),("provision_coverage","provisions_kzt")]: m[k]=m[num]/total
    groups=defaultdict(lambda:D(0))
    for r in selected: groups[r["group_id"]] += r["amount"]
    m["top10_kzt"]=sum(sorted(groups.values(),reverse=True)[:10],D(0))
    m["top10_share"]=m["top10_kzt"]/total; metrics.append(m)
    for dim in ["sector","program"]:
        for category in sorted({r[dim] for r in selected}):
            b=aggregate([r for r in selected if r[dim]==category])
            for k,num in [("par30","par30_kzt"),("par90","par90_kzt"),("npl","npl_kzt")]:b[k]=b[num]/b["portfolio_kzt"]
            breakdowns.append(dict(report_date=date,dimension=dim,category=category,**b))
baseline=metrics[0]
for m in metrics:
    m["portfolio_change_kzt"]=m["portfolio_kzt"]-baseline["portfolio_kzt"]
    m["portfolio_change_pct"]=m["portfolio_kzt"]/baseline["portfolio_kzt"]-1
    for k in ["par30","par90","npl"]:m[k+"_change_pp"]=(m[k]-baseline[k])*100
    m["provisions_change_kzt"]=m["provisions_kzt"]-baseline["provisions_kzt"]
    m["top10_change_pp"]=(m["top10_share"]-baseline["top10_share"])*100
def serial(o): return str(o) if isinstance(o,D) else o
result=dict(metrics=metrics,breakdowns=breakdowns,raw_rows=len(raw),dedup_rows=len(rows),
            duplicate_rows_removed=len(raw)-len(rows),written_off_excluded=len(rows)-len(facts),
            hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/"data").glob("*.csv")})
(OUT/"reference.json").write_text(json.dumps(result,ensure_ascii=False,indent=2,default=serial)+"\n")
print(json.dumps(dict(raw=len(raw),dedup=len(rows),active=len(facts))))

