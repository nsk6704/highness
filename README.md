# Highness

**Highness is a minimal open-source coding-agent harness built around one principle: AI-generated changes should be independently verified by the runtime.**

## The Core Difference

Traditional coding agents:

```
User → Agent → Tools → Done
```

Highness:

```
User
  ↓
Agent
  ↓
Tools
  ↓
Integrity check          ← did you change what "success" means?
  ↓
Verification
  ↓
  ├── visible suite
  ├── held-out suite      ← tests you were never allowed to read
  ↓
  ├── PASS → Done
  └── FAIL → Agent repair
```

The model can propose and execute changes, but **Highness owns verification and recovery**. The model does not get to declare success. The runtime determines whether the task actually succeeded.

## In Simple Words

Highness gives an AI a coding task and lets it try to fix the code. Then Highness runs real tests to check the result. If the tests fail, the failure is sent back to the AI so it can try again.

Some projects can also provide **held-out tests**. These are extra tests the AI is not allowed to read. They check whether the AI understood the requirement instead of fixing only the examples it saw.

For example:

```text
Visible test: divide(6, 2) = 3
Held-out test: divide(7, 2) = 3.5
```

The AI may pass the visible test with incorrect integer division. The held-out test catches that. Held-out tests are optional, but when they are configured, Highness requires both the visible and held-out tests to pass.

In short:

```text
AI edits the code -> Highness tests it -> failures go back to the AI -> verified result
```

## Why this isn't just CI

A CI workflow runs your tests once and stops. Anyone can pass CI by editing the
test file. That is the gap Highness closes:

|                                             | CI    | A bare agent loop | Highness          |
| ------------------------------------------- | ----- | ----------------- | ----------------- |
| Runs the tests                              | yes   | yes               | yes               |
| Closes the failure loop                     | no    | yes               | yes               |
| Tests the model can read are the only tests | yes   | yes               | **no**            |
| Editing a test is a normal commit           | yes   | yes               | **voids the run** |
| Zero tests found means pass                 | often | often             | **means fail**    |

## Features

- **Held-out verification** — a harness-owned suite the agent has no tool access to, and which decides the outcome
- **Integrity checks** — the definitions of success are hashed before the run and re-checked before every verdict
- **Tool deny-list** — tests, specs, and configuration are protected from writes; held-out tests are protected from reads
- **Vacuous-run detection** — a runner that exits 0 having executed nothing is a failure, not a pass
- **Failure triage** — failures are classified and only relevant evidence is forwarded
- **Ollama Cloud integration** — tool-calling agent over the OpenAI-compatible endpoint
- **Tool-calling agent loop** — read, write, edit, and shell
- **Deterministic verification** — real test runners, never an LLM grading the LLM
- **Minimal by design** — no TUI, no MCP, no vector databases, no RAG

## Quick Start

```bash
git clone https://github.com/nsk6704/highness
cd highness
npm install
npm run build

cp .env.example .env   # then add your Ollama Cloud API key

# Run against a target project
cd path/to/your/project
node /path/to/highness/dist/cli.js "Fix the failing tests"
```

## Demo

The demo is built to show the part that matters: an agent that gets every test
it can see passing, and is still wrong.

```bash
cd demo-project
npm install
../dist/cli.js "Fix the calculator"
```

The calculator's contract lives in [`demo-project/SPEC.md`](demo-project/SPEC.md).
The bugs are unmarked and semantic:

- `divide` truncates with `Math.floor` instead of dividing exactly
- `power` is off by one, and accepts negative exponents
- `factorial` accepts fractional input
- `isPrime` reports `1`, `0`, and every negative number as prime

Baseline:

```
visible    4 failed, 13 passed, 17 total
held-out   9 failed,  7 passed, 16 total
```

The visible suite covers only part of `SPEC.md`. `isPrime`, the negative
exponent, and the fractional factorial guard are specified and enforced, but the
agent cannot see those tests.

The interesting run is the one where the agent fixes `divide` and `power`, gets
`npm test` green, and confidently stops:

```
Verification
────────────────────────────────────
  ✓ visible 17 passed, 0 failed
  ✗ held-out 11 passed, 5 failed

✗ Verification failed (attempt 1/3)
```

Five things it never saw were still broken. It repairs against the failure
names and evidence, and the second attempt comes back green.

## Configuration

Projects opt in with `highness.config.json`:

```json
{
  "verify": "npm test",
  "heldOut": "npm test -- --config .highness/jest.heldout.config.mjs",
  "guard": {
    "denyRead": [".highness"],
    "denyWrite": [
      "test",
      ".highness",
      "SPEC.md",
      "jest.config.mjs",
      "package.json"
    ]
  },
  "integrityFiles": ["package.json", "jest.config.mjs"]
}
```

- **`verify`** — the tests the agent may read. Required for held-out to mean anything.
- **`heldOut`** — the harness-owned suite. Optional; without it you get visible-only.
- **`denyRead`** — the agent cannot read these. The verifier can.
- **`denyWrite`** — the agent cannot modify these.
- **`integrityFiles`** — additional files to hash, such as `package.json`, where rewriting the `test` script is a faster cheat than fixing the bug.

Patterns are gitignore-style: `test` guards the directory and everything under
it, `*.test.ts` matches at any depth, and `src/**` spans directories.

With no manifest, Highness falls back to auto-detection and runs unguarded, which
is the old behaviour.

### What a PASS requires

Both suites green **and** integrity intact. A held-out pass does not excuse a
broken visible suite, because the repository is still broken.

### What counts as cheating

Any of these ends the run immediately, before verification, with a non-zero exit:

- editing or deleting a guarded file
- weakening the test script (`--passWithNoTests`, a narrowed `-t` filter)
- reading the held-out suite

The verdict is **not appealable**. The model does not get to argue its way past
an integrity violation, because the whole premise is that it does not get to
declare success.

### Known limitation

`shell` is screened by literal path match, which blocks the direct attempts. It
is **not a security boundary** — a determined model can obfuscate a path in a
generated script. Integrity hashing is the layer that actually catches this, and
it is verified to do so. For real isolation you would need an OS-level sandbox.

## CLI Options

```bash
highness "Fix the bug"                    # Default: 3 attempts, auto-detect
highness -n 5 "Fix the bug"               # Max 5 repair attempts
highness -v "pytest" "Fix the bug"        # Override the visible command
```

Environment:

- `OLLAMA_API_KEY` — **required.** https://ollama.com/settings/keys
- `OLLAMA_MODEL` — optional. Default `gpt-oss:120b`

Direct cloud requests use the identifiers at https://ollama.com/api/tags
(`gpt-oss:120b`, `gpt-oss:20b`, `qwen3-coder:480b`, …). The `-cloud` suffix is
only for the Ollama CLI and local server.

## Architecture

```
src/
├── cli.ts                    # entry point, streaming output, root .env fallback
├── agent/
│   ├── loop.ts               # agent loop, integrity gate, repair cycle
│   └── messages.ts           # types
├── model/
│   └── ollama.ts             # OpenAI SDK against Ollama's compat endpoint
├── tools/
│   ├── guard.ts              # deny-list enforcement, raises GuardViolation
│   ├── read-file.ts
│   ├── write-file.ts
│   ├── edit-file.ts
│   └── shell.ts
├── verification/
│   ├── manifest.ts           # highness.config.json
│   ├── integrity.ts          # hash snapshot and violation detection
│   ├── test-count.ts         # runner summary parsing, vacuous-run detection
│   ├── triage.ts             # failure classification and evidence extraction
│   └── verifier.ts           # suite runner
└── utils/
    ├── glob.ts               # gitignore-style matcher
    └── paths.ts              # traversal protection
```

## Verification

The verifier is **not an LLM**. It runs real runners and reads their summaries:

```bash
npm test        # package.json
pytest          # pyproject.toml / pytest.ini
cargo test      # Cargo.toml
go test ./...   # go.mod
```

Counts are parsed for jest/vitest, cargo, pytest, mocha, and go. Recognition is
deliberately positive-only: a project may verify with `tsc --noEmit` or a lint
step, and the harness does not invent counts for output it does not understand.

**A runner that exits 0 without executing anything is a failure.** Confirmed
against real jest:

```
$ npx jest --passWithNoTests --testPathPattern nothing_matches_this
exit 0, zero tests

✗ exited 0 but ran no tests
```

### Failure triage

Failures are classified and the model receives the failing case names plus
expected/received pairs rather than a raw log:

```
Failure class: assertion_failure
An assertion did not hold. Compare expected against received.

Failing cases (2):
  - Calculator › divide › divides with decimal result
  - contract: isPrime › one is not prime

Evidence:
  Expected: 3.5
  Received: 3
```

## Repair Loop

Held-out failures are forwarded as case names and triage output. The model cannot
read the assertions, but without the failure evidence the task would be
unsolvable — the same line SWE-bench draws.

```
[VERIFICATION FAILED]
The requested change has NOT been verified.
Command: npm test -- --config .highness/jest.heldout.config.mjs
Attempt: 1

These failures come from the held-out suite, which you cannot read.
...
```

Control returns to the model, which repairs and the loop runs again. After the
final attempt:

```
✗ Verification failed after maximum attempts
  Attempts: 3
```

Highness does **not** claim success, and exits non-zero.

### Runtime guards

- **Tool output truncation** — capped at 4000 characters before entering the conversation
- **Tool call cap** — 25 per attempt, then straight to verification so current state is still honestly checked

`gpt-oss` enables thinking by default, and reasoning tokens count against
`max_tokens` (8192). A response cut off mid-arguments is fed back as a tool error
rather than crashing.

## Roadmap

- [ ] `edit_file` via structured patches instead of full-content replacement
- [ ] Per-attempt rollback when a repair makes things worse
- [ ] Session logging to disk for post-mortem analysis
- [ ] OS-level sandbox so `shell` is a real boundary
- [ ] Support for multiple held-out shards and per-suite timeouts

