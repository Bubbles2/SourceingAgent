# Regression check (Phase 10)

- Baseline: `baseline_metrics.json`; tolerance 0.05; taxonomy scope `draft`
- Result: **PASS**

| Check | Result | Detail |
|---|---|---|
| hybrid_broad precision@10 | pass | 0.795 → 0.8 |
| hybrid_broad recall@50 | pass | 0.828 → 0.827 |
| hybrid_broad ndcg@10 | pass | 0.88 → 0.883 |
| hybrid_broad queries without result | pass | 0 → 0 |
| hybrid_broad mean latency | pass | 30.7 → 35.9 ms |
| hybrid_exact precision@10 | pass | 0.725 → 0.72 |
| hybrid_exact recall@50 | pass | 0.662 → 0.661 |
| hybrid_exact ndcg@10 | pass | 0.819 → 0.815 |
| hybrid_exact queries without result | pass | 0 → 0 |
| hybrid_exact mean latency | pass | 19.1 → 30.1 ms |
| dated_to only on periods, in_style_of only on styles | pass | lot_concepts |
| published views show approved rows only | pass | published_concepts |
| no classification uses a rejected concept | pass | reclassify after rejecting concepts |
| external search does not modify the taxonomy | pass | [1128, 2260, 500] → [1128, 2260, 500] |

