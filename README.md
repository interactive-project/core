# Interactive Project Core

Headless activity lifecycle and deterministic synchronous state transitions.

- [Lifecycle, atomic dispatch and engine adapter contract](docs/lifecycle-v1.md)
- [Ordered validation, resolution and loading cleanup](docs/loading-v1.md)
- [Runtime conformance, public boundaries and compatibility policy](docs/conformance-v1.md)

The runtime returns Protocol-compatible EngineSession methods plus lifecycle/state/event subscriptions. Clocks, random sources, identifiers and services are host-injected. Reducers and state-machine facades share immutable portable state; Core imports no UI or styling system. Trusted validators are injected; the optional Node loading entry validates and resolves before factories execute. A real Registry → Protocol → Quiz → Core → snapshot/restore conformance scenario runs in the Node test suite; its `dom` mount is a headless host-port fixture, not a browser renderer. The Quiz fixture uses its bundled validator because its schema references Content Node externally, which the generic Registry schema resolver deliberately rejects rather than fetching.

Run npm ci --ignore-scripts and npm test. Dependencies are pinned to verified Protocol/Events/Registry commits for CI. Repository implementation does not assert package publication or production domain/UI release.
