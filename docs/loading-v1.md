# Ordered activity loading v1

The optional Node loading entry implements loadActivity for untrusted plain JSON or strict bounded JSON text. It imports Protocol offline validation/catalog helpers and Registry's exact/capability-aware lookup; the headless root runtime remains free of Ajv/Node schema imports. The host supplies an approved exact GenerationCatalog, trusted synchronous domain validators, registry, explicit policy/driver availability and live EngineContext. Loader data never supplies validator code, module URLs, factories or credentials.

## Validation before factory execution

Capture host policy/driver list/mode/context before domain callbacks. Parse/copy isolated frozen JSON within Protocol budgets (strict text rejects duplicate decoded names), validate ActivitySpec, select an approved exact type/domain version and validate config against its registered schema. Unknown versions fail structurally at /activitySchemaVersion. Semantic validation checks cross-field meaning and must return explicit permissions/capabilities arrays; missing, async, malformed or throwing callbacks fail closed with safe text.

Check catalog plus semantic permissions against captured network/execution/media policy, default denied. Then check catalog plus semantic capability requirements and every required driver through Registry, including requested renderer host. Offline requirements cannot coexist with selected network requirements. generated:true additionally requires aiGeneratable; authored loads do not pretend an ordinary authored schema has AI-generation conformance. This flag is host configuration, never content authority.

Resolve the exact authored protocol/domain version, never a range that rewrites the input. The registered generation entry must match the approved catalog entry exactly (schemaId, capabilities, drivers and permissions included) before any plugin factory executes. Missing renderer/driver, unsupported capability and catalog mismatch stop here. Registry selection does not invoke factories. After acceptance, create the engine with the isolated ActivitySpec and host context, then optionally its exact renderer with session/live mount/services. Factories may delegate to Registry's trusted deduplicated lazy loader; Core does not fetch/import arbitrary data-supplied locations.

## Diagnostics and host resource ownership

Failures return loaded:false with structural/semantic/permission/capability/engine/renderer stage, stable load.* or Protocol input/generation code, RFC 6901 pointer, error severity and static safe message. Domain/native exceptions, rejected source content, answers, credentials and stack traces are not forwarded. Custom validator error payloads are ignored. The accepted authored activity is frozen; engine/renderer/mount/services remain live and are never serialized.

Domain validators and factories are trusted host code. JSON budgets bound validation input, not arbitrary blocking JavaScript, media execution or CPU/memory providers. Actual execution/network service permissions still require host enforcement when invoked; a capability flag alone grants none. Concrete schema/engine/host release compatibility is a separate integration gate.

## Cancellation, deadlines and cleanup

An already-aborted signal stops before validation/factory execution. A shared loading controller is passed to factories; user cancellation or timeout rejects the current stage, aborts that signal and initiates reverse-order cleanup of handles already obtained. Default deadline is 30 seconds, host-configurable 1..60 seconds; it covers asynchronous engine/renderer construction. Blocking synchronous host callbacks cannot be preempted by a JavaScript timer, so callbacks must be bounded/cooperative.

Factories may return a session or promise. Core awaits it against cancellation/deadline, verifies required lifecycle functions and tracks ownership. If a noncooperative factory resolves after abandonment, its returned handle is disposed instead of installed. Failed renderer construction disposes the existing engine. A factory owns all partial resources until it returns a handle; Core cannot clean private resources that were never returned. Cleanup functions must be idempotent/cooperative; promises are observed without waiting forever, and failures report only load.cleanup to the host diagnostic hook. No native errors or late unhandled rejections are exposed.

Successful loading removes its loading-time cancellation/deadline listeners and transfers handles to the returned loaded:true result. Its idempotent dispose aborts the engine context signal and starts renderer-then-engine cleanup. Cancellation of the original loading signal after successful transfer does not implicitly dispose a running session. Core's later runtime effect cancellation and transactional restore are separate #3/#4 operations.

## Compatibility and verification

No Protocol/Events/Registry schema changes or authored migration are required. Optional loading adds peer Registry and optional Ajv format/validator requirements; pinned Git commits are used by CI without asserting npm publication. Registry catalog export/conformance generation belongs to registry#3; this phase consumes an explicitly host-approved catalog.

Tests cover malformed quiz config, duplicate JSON keys, cross-field rejection, unsupported exact versions, denied execution, policy capture against callback mutation, missing WASM driver/renderer, generated-mode capability rejection and catalog mismatch. No factory runs on those failures. Success runs a real Core fixture runtime through validated Registry construction and optional host-port renderer. Tests also cover safe validator/native exceptions, rejected renderer cleanup, already/ongoing cancellation, timeout and cleanup of a late result. Existing lifecycle parity/atomic state and ES2022 types remain required. Stand-ins do not certify production quiz/browser/WASM packages.

Decision: improvement-proposals/decisions/core-loading-v1.md.
