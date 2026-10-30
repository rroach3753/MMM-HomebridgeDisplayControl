# Contributing

Read the [setup and behavior documentation](README.md) before proposing changes.
Keep display control independent of vendor status modules and preserve
server-only credentials and automation policy.

## Development

Use Node.js 22 or later. No npm dependencies are needed.

```bash
node --run test
node --run check
```

Add focused tests for behavior changes. Never run the live Pi test as part of
routine automated checks: it deliberately changes physical display power.
For hardware testing, follow [the testing guidance](README.md#development-and-testing)
and restore the initial display state afterward.

## Bug reports

Include:

- MagicMirror, Node.js, Raspberry Pi OS, and module versions.
- Desktop compositor and selected display backend.
- Sensor plugin and service type, without camera IDs or private locations.
- Expected behavior, observed behavior, and reproducible steps.
- Relevant sanitized module logs.

Do not include passwords, bearer tokens, complete environment files, or
unredacted Homebridge accessory exports. For suspected vulnerabilities, follow
[SECURITY.md](SECURITY.md) rather than posting exploit details publicly.

## Scope and compatibility

Use MagicMirror's documented module and helper APIs. Keep filenames and
registration names consistent. Update the README and changelog for user-visible
changes. Do not add arbitrary shell commands, browser-controlled power targets,
or silent recovery that treats unavailable sensors as clear.
