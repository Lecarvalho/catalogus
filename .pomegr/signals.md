# Pomegr reporting policy

Policy version: 7

## Session naming

- After the first substantive request makes the work clear, set one concise, meaningful title through an available provider-native capability. If no safe title capability is available, allow the provider's automatic title.
- Never ask the user to name the session and never overwrite a title explicitly set by the user. Only the main session names itself; subagents never rename the session.

## Privacy and semantics

- Report only project-specific state that helps an observer understand the work.
- Treat every signal as agent-reported and potentially stale, not as a Pomegr judgment.
- Report transitions, not heartbeats. Replace a signal when a new configured state applies; clear agent or session state when none applies.
- Never include prompts, responses, secrets, commands, stdout, stderr, tool results, credential values, or sensitive repository content.
- Use only labels and conditions approved below. Pomegr's universal MCP validation remains the safety boundary, not this file as an application enum.

## Tool suffixes

Use these suffixes in the resolved Pomegr MCP namespace; provider-specific prefixes are not part of this policy.

| Tool suffix | Use |
| --- | --- |
| `report_session_signal` | Report or replace the overall session state when a configured Session signals row applies. |
| `clear_session_signal` | Clear the session state when no configured Session signals row applies. |
| `report_agent_signal` | Report or replace the calling agent's state when a configured Agent signals row applies. |
| `clear_agent_signal` | Clear the calling agent's state when no configured Agent signals row applies. |
| `report_task_signal` | Record a durable outcome for a recognized execution-task ID when a configured Task signals row applies; task signals are never cleared. |
| `report_session_progress` | When Session progress is enabled, report or replace the overall progress estimate. |
| `clear_session_progress` | Clear the progress estimate when it is no longer meaningful. |

## Delegated agent tooling

- A subagent can start without this policy in its context. Declare every signal-owning subagent type under `Delegated agents`; the active provider adapter's delegation hook then supplies the applicable rows to that subagent.
- Never rely on the delegating session remembering to paste the rows. Injection is the mechanism; a pasted copy is only a fallback, and the hook does not append a second copy when the prompt already carries one.
- Every signal-owning subagent must retain access to the Pomegr MCP server and the applicable reporting tools. A custom agent definition that replaces or disables inherited MCP configuration must explicitly restore that access.
- Match the logical tool suffixes `report_agent_signal`, `report_task_signal`, and `clear_agent_signal` in the resolved Pomegr MCP namespace; provider-specific prefixes are not part of this policy.
- Never assign agent- or task-signal reporting to a subagent that cannot call the applicable Pomegr MCP tool. Add the tool, or keep the reporting in the delegating session.

## Session progress

- Enabled: yes

## Delegated agents

| Agent type | Owns |
| --- | --- |
| * | agent and task |

## Session signals

| Label | Tone | Report when | Replace or clear when |
| --- | --- | --- | --- |
| Awaiting validation | warning | An implementation change is written but no separate validating agent has reproduced its claims yet. | Replace with Validated or Defects open once a validator that did not write the code reports; clear when the session moves to unrelated work. |
| Validated | positive | A validator that did not write the code reproduced the implementer's claims and the repository verify command passed. | Replace with Defects open if later work reopens defects, or with Plan board stale while the status board lags; clear on unrelated work. |
| Defects open | negative | Validation reported defects in the change that are not fixed yet. | Replace with Awaiting validation when fixes are written, or Validated once re-validated; clear when the change is abandoned. |
| Plan board stale | info | Verified work is not yet reflected in the docs/PLAN.md status board the main session owns. | Replace or clear once the board records the verified work, or when the session moves to unrelated work. |

## Agent signals

| Label | Tone | Report when | Replace or clear when |
| --- | --- | --- | --- |
| Defects found | negative | This validating agent reproduced at least one defect by executing the built artifact against inputs it wrote itself. | Replace if a later check in this agent changes the conclusion; clear when the validation brief is finished and reported. |
| Reproduced clean | positive | This validating agent executed the built artifact end to end and could not reproduce any defect inside its briefed scope. | Replace with Defects found if a further check reproduces one; clear when the brief is finished and reported. |
| Blocked on owner | warning | This agent hit a fact absent from the repository and left the field unanswered rather than writing a plausible default. | Replace once the owner answers and work continues; clear when the brief ends or the question stops applying. |

## Task signals

| Label | Tone | Report when | Replace or clear when |
| --- | --- | --- | --- |
| Verify passed | positive | A recognized execution task ran the repository build and test verification to completion with no failures. | Replace only if a later outcome for the same execution task supersedes it; task signals are not cleared. |
| Verify failed | negative | A recognized execution task ran the repository verification and it reported failures. | Replace only if a later outcome for the same execution task supersedes it; task signals are not cleared. |
