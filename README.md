# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/bingx12/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/bingx12/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0: it answers exactly as the reference does on every case — same `{columns, rows, errors}` for every input, including every broken-row case (stray CRs, unterminated quotes, quote junk, short/long rows, blank lines, BOM) — while using far less CPU time.

On the kit's practice set (6 cases, ~10.2 MB of CSV), the parse runs in ~101 ms of CPU against csv-reader 1.0.0's ~714 ms, a ~7x speedup, with byte-identical `answers.json` output end to end. Correctness was checked against the reference on the 6 practice cases, 212 hand-written adversarial cases, and 150,000+ fuzzed inputs, with zero mismatches.

How it is fast: one indexOf-driven pass over the text. Plain unquoted fields are sliced out whole between delimiters (two short scans and one slice per field); quoted fields jump straight to their closing quote; a record with no quote at all splits on commas in C. The slow paths — a stray CR inside a field, a CR inside quotes, a quote that never closes, junk after a closing quote — run the reference's logic, only on the few fields that need them. Nothing is cached between cases; each `run(input)` answers alone.

## Run it

```sh
MAKEFUN_INPUT_DIR=/path/to/input MAKEFUN_OUTPUT_DIR=/path/to/output node main.ts
```

`main.ts` reads every case from `$MAKEFUN_INPUT_DIR/cases.json`, answers each with `run` from `solve.js`, and writes `$MAKEFUN_OUTPUT_DIR/answers.json`. Node 22 or later; no dependencies, no build step.

---

<sub>Entered on [make.fun](https://make.fun/?ref=k6eq9xtw&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
