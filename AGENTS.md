# Instructions actually used for this assessment
- RAW_BRIEF.txt is the authority. Do not use real customer or employer data.
- Keep accounting money in Decimal/PostgreSQL numeric; round for display only.
- Exact duplicate rows can be removed. Conflicting loan keys and FX keys fail closed.
- Use FX at the exact report date. Never silently drop unknown FX or invent a rate.
- Exclude written-off loans from every numerator and denominator.
- PAR30 is strictly >30, PAR90 strictly >90. Restructured loans are NPL even at zero DPD.
- NPL provisioning takes precedence over the low-DPD provision bands.
- Concentration is the top10 borrower GROUPS, not ten loans or borrowers.
- Independently reconcile SQL totals against a Python Decimal implementation.
- Verify repeated schema/load/view runs and targeted boundary/error cases.
- Never claim this toy provision policy is a production IFRS9 ECL model.
- Do not invent candidate availability, prior BI tooling, or AI usage history.
- Do not publish this repository or submit personal data without the required authorization.

