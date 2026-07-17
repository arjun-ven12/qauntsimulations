# Final evidence report

Runtime Milestone 8 generates deterministic final reports after minimisation.

## Outputs

Each report is written under the configured evidence root:

```text
storage/evidence/reports/<investigationId>/<findingId>/
  final-report.json
  final-report.md
```

Both files are persisted as `FINAL_REPORT` evidence artifacts with relative storage keys, MIME type, size, SHA-256 checksum, redaction flag, and safe metadata. The JSON report ID is recorded in finding causal metadata as `finalReportEvidenceId`.

## Schema

The structured report contains:

- report version;
- investigation and finding IDs;
- title, summary, business impact;
- project/environment/journey IDs;
- original observation world and experiment;
- reproduction run and outcome;
- retained, removed, and inconclusive minimisation conditions;
- bounded delay range;
- final confirmation world and result;
- confidence before and after minimisation;
- deterministic reproduction steps;
- evidence artifact index;
- limitations;
- runtime provenance.

## Markdown structure

The Markdown report includes:

1. Title
2. Executive summary
3. Finding overview
4. Business impact
5. Environment
6. Initial observation
7. Exact reproduction
8. Controlled comparisons
9. Minimisation process
10. Minimal tested triggering conditions
11. Bounded failure range
12. Reproduction steps
13. Invariant results
14. Evidence index
15. Confidence and causal status
16. Contradictory or inconclusive evidence
17. Limitations
18. Runtime provenance

## Security and redaction

The report indexes large artifacts rather than inlining binary evidence. It must not include API keys, database URLs, cookies, authorization headers, raw secrets, stack traces, or raw provider prompts. Report paths are constrained under the configured evidence root.

## API exposure

Existing evidence and finding list endpoints can expose final report metadata through normal artifact records and finding causal metadata. No unsafe generic minimisation endpoint is added in Prompt 8.

## Limitations

- PDF output is not generated.
- The report is deterministic and does not call AI.
- Report bodies are stored as evidence files rather than large database columns.
- UI rendering for final reports remains a follow-up milestone.
