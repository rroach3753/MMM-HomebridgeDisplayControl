# Changelog

All notable changes to this project are documented here.
Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0-alpha.1] - 2026-10-23

### Added

- Initial implementation of standalone Homebridge-driven display control.
- Support for standard HomeKit occupancy and motion services, including sensors
  exposed by homebridge-govee and homebridge-unifi-protect.
- Any-sensor wake and all-sensors-clear shutoff with a five-minute default delay.
- Server-only configuration, disabled by default with no selected sensors.
- Automatic Wayland/X11 selection and explicit backend override.
- Wayland connector control through `wlr-randr` and X11 DPMS through `xset`.
- Live display-state queries, command verification, and explicit error reporting.
- Conservative handling of missing, ambiguous, and unreadable sensor readings.
- Homebridge HTTPS login, token renewal, and bounded request deadlines.
- Optional visible status and a single server-side controller per module type.
- Automated tests and an opt-in, reversible Raspberry Pi integration test.

### Verified

- Local automated tests and syntax checks.
- Raspberry Pi labwc: live readings from Govee occupancy and UniFi Protect motion
  services, physical display off/on, and controlled either-sensor wake.
- Five-minute absence threshold using an accelerated test clock.
- Installed MagicMirror 2.38.0 NodeHelper lifecycle and socket status delivery.
- Restoration of initial display state with no persistent mirror configuration
  changes. X11 remains unit-tested only, not hardware-certified.
