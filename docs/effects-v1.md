# Host-owned effects v1

Import the portable coordinator from `@interactive-project/core/effects`. Reducers stay synchronous: commit the requested domain change first, then submit an effect request bound to the resulting revision. The host registers trusted execution/network/media services and grants permissions explicitly. Missing optional drivers produce a failed effect action, never an incorrect-answer score.

Each request identifies activity, session, optional attempt, runtime generation, base revision, and a named lane. A newer request in the same lane supersedes its predecessor. Results apply only while all identities and the base revision still match. On restore or attempt replacement the host must change the generation and dispose the previous coordinator. Services receive an abort signal; the host owns resources and must cooperate with cancellation. Late callbacks cannot commit.

Provide nextActionSequence as the next admissible sequence, without consuming it before applyAction accepts the action. applyAction must synchronously dispatch through the validated runtime boundary. Busy/rejected results remain in a bounded outbox for flush; changed context makes them stale. Limits reject admission rather than evicting pending results. History eviction limits deduplication to retained records.

Requests default to a 30-second deadline, zero retries, 16 active jobs and 32 total retained/reserved slots. Retries are opt-in (at most three); host services must make external side effects idempotent by request ID. Each request/output is limited to 1 MiB, each record to 2 MiB. No service is dynamically discovered or implicitly invoked.

Completion, failure, cancellation and timeout are separate namespaced Protocol actions. evaluateAfterEffects waits for effects and evaluates read-only with its own deadline and cancellation. Canceling evaluation does not cancel jobs. The host evaluator returns Protocol pending/failed/unevaluable outcomes as appropriate; a completed normalized score of zero means a evaluated incorrect answer. Evaluation checks identity, generation and revision again after asynchronous work.

getReplayRecords returns only applied records. Replay feeds the recorded action to the same synchronous boundary without executing a service. Records contain local input/output and may contain sensitive content; persist only with host policy, never as automatic telemetry. Hosts must authorize replay data and validate domain payloads. Recording is bounded in-memory history, not a durable distributed log. Snapshot persistence is addressed separately in core#4.

EffectRequest uses Core-owned effectVersion 1.0.0. Its schema is exported at ./schemas/effect-request.v1.schema.json. Protocol and Events wire contracts remain unchanged.
