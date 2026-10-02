# Interactive Project Core

Headless activity lifecycle and deterministic synchronous state transitions.

- [Lifecycle, atomic dispatch and engine adapter contract](docs/lifecycle-v1.md)

The runtime returns Protocol-compatible EngineSession methods plus lifecycle/state/event subscriptions. Clocks, random sources, identifiers and services are host-injected. Reducers and state-machine facades share immutable portable state; Core imports no UI or styling system. Trusted validators are injected; pipeline, asynchronous effects and snapshots are subsequent issues #2/#3/#4.

Run npm ci --ignore-scripts and npm test. Dependencies are pinned to verified Protocol/Events/Registry commits for CI. Repository implementation does not assert package publication or production domain/UI release.
