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
Verification
  ↓
  ├── PASS → Done
  └── FAIL → Agent repair
```

The model can propose and execute changes, but **Highness owns verification and recovery**. The model does not get to declare success. The runtime determines whether the task actually succeeded.

## Features

- **Ollama Cloud integration** - Fast LLM inference for tool-calling agents
- **Tool-calling agent loop** - Read, write, edit files and execute shell commands
- **Independent verification** - Deterministic test running (not LLM-based)
- **Automatic repair loop** - Failed verification feeds back to the model for repair (max 3 attempts by default)
- **Clean CLI** - Streaming output showing the agent's reasoning, tool calls, and verification results
- **Minimal by design** - No TUI, no MCP, no vector databases, no RAG, no sandboxing

## Quick Start

```bash
# From source (not published to npm yet)
git clone https://github.com/nsk6704/highness
cd highness
npm install
npm run build

# Configure
cp .env.example .env   # then add your Ollama Cloud API key

# Run on a task
./dist/cli.js "Fix the failing tests"
```

Or run locally:

```bash
git clone https://github.com/nsk6704/highness
cd highness
npm install
npm run build
cd demo-project && npm install && cd ..
./dist/cli.js "Fix the calculator so all tests pass"
```

## Demo

Try it on the included demo project:

```bash
cd demo-project
npm install
../dist/cli.js "Fix the calculator so all tests pass"
```

The demo has a calculator with three intentional bugs:
- `divide` multiplies instead of dividing
- `power` has an off-by-one error
- `factorial` forgets to return the result

Baseline before you start: 6 of 17 tests fail.

A typical run looks like this:

1. Read the source and test files
2. Identify the bugs
3. Edit the implementation
4. Run `npm test` → **6 failed, 11 passed**
5. Highness verification runs it independently → FAIL
6. The failure is appended to the conversation and the model repairs
7. Re-verify → PASS → success declared

In practice `gpt-oss:120b` often solves these three seeded bugs in a single
attempt, so the repair step may not trigger. That is the verifier working as
intended rather than a bug, but it does mean the demo project is not a reliable
way to showcase the repair loop — see [Roadmap](#roadmap).

## CLI Options

```bash
highness "Fix the bug"                    # Default: 3 attempts, auto-detect test command
highness -n 5 "Fix the bug"               # Max 5 repair attempts
highness -v "pytest" "Fix the bug"        # Custom verification command
```

## Architecture

```
src/
├── cli.ts                    # CLI entry point with streaming output
├── agent/
│   ├── loop.ts              # Core agent loop with repair logic
│   └── messages.ts          # Type definitions (Message, Tool, Session, etc.)
├── model/
│   ├── ollama.ts            # OpenAI SDK against Ollama's compat endpoint
│   └── index.ts             # Model interface
├── tools/
│   ├── read-file.ts         # Read file contents
│   ├── write-file.ts        # Write/create files
│   ├── edit-file.ts         # Edit files (MVP: full content replacement)
│   ├── shell.ts             # Execute shell commands
│   └── index.ts             # Tool registry
├── verification/
│   └── verifier.ts          # Deterministic verification runner
└── utils/
    └── paths.ts             # Path resolution with traversal protection
```

## Security Boundary

> **The model never directly executes code.**

```
Ollama
 │
 │ tool call
 ▼
Highness
 │
 │ validate
 ▼
Tool executor
 │
 ▼
OS
```

For the hackathon, shell execution is local and unrestricted **with an explicit warning**. Do not use on untrusted code.

## Configuration

Environment variables:
- `OLLAMA_API_KEY` - **Required.** Create a key at https://ollama.com/settings/keys
- `OLLAMA_MODEL` - Optional. Default: `gpt-oss:120b`

Put these in a `.env` file (see `.env.example`):

```bash
OLLAMA_API_KEY=your_key_here
OLLAMA_MODEL=gpt-oss:120b
```

Direct cloud requests use the model identifiers listed at
https://ollama.com/api/tags (e.g. `gpt-oss:120b`, `gpt-oss:20b`,
`qwen3-coder:480b`, `kimi-k2.6`, `glm-5.3`). The `-cloud` suffix
(`gpt-oss:120b-cloud`) is only for the Ollama CLI and local server.

### Runtime guards

Two limits keep the loop from running away:

- **Tool output truncation** - tool results and verification output are capped
  at 4000 characters before entering the conversation, so a noisy test run
  can't blow up the context window.
- **Tool call cap** - 25 tool calls per attempt. On hitting the cap the harness
  stops calling tools and proceeds straight to verification, so current state is
  still honestly checked.

`gpt-oss` is a reasoning model, so Ollama enables thinking by default. Reasoning
tokens count against `max_tokens` (set to 8192). If a response is cut off before
its tool arguments are complete, the harness feeds the truncation back to the
model as a tool error instead of crashing.

## Verification

The verifier is **not an LLM**. It runs your test command deterministically:

```bash
npm test        # package.json
pytest          # pyproject.toml / pytest.ini
cargo test      # Cargo.toml
go test ./...   # go.mod
```

Auto-detection works for common project types. Override with `--verify`.

## Repair Loop

When verification fails, Highness appends the evidence to the conversation as a
distinct `verification` message. Since Ollama's chat API has no such role, it is
serialized as a user message:

```
[VERIFICATION FAILED]
The requested change has NOT been verified.
Command: npm test
Attempt: 1

Stdout:
... (capped at 4000 chars)

Stderr:
...

Analyze the failure, repair the implementation, and try again.
```

Control returns to the model, which can read files, edit, and run commands again.

Maximum attempts: 3 (configurable with `-n`). If all fail:

```
✗ Verification failed after maximum attempts
  Attempts: 3
```

Highness does **not** claim success, and exits non-zero.

## Roadmap

Roughly in priority order:

- [ ] A demo task that reliably forces at least one repair cycle
- [ ] Verifier triage — classify failures (compile error, assertion, timeout)
      and hand the model only the relevant evidence
- [ ] Anti-cheat: detect when a model edits tests or weakens the verify command
      to force a PASS
- [ ] `edit_file` via structured patches instead of full-content replacement
- [ ] Per-attempt rollback when repair makes things worse
- [ ] Session logging to disk for post-mortem analysis

## License

Unlicensed for now — add a LICENSE before making this a real OSS release.