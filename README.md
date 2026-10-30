# MMM-HomebridgeDisplayControl

A standalone MagicMirror module that controls the local Raspberry Pi's display
using Homebridge occupancy and motion sensors. It is independent of any Govee
status module.

**Stable release: v1.0.0.** Keep SSH/manual display recovery available when
configuring automation. Wayland/labwc has been hardware-tested; X11 is unit-tested only.

## Dependencies and external APIs

- [MagicMirror installation](https://docs.magicmirror.builders/getting-started/installation.html)
  and its [platform requirements](https://docs.magicmirror.builders/getting-started/requirements.html).
- [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x), using
  its local HTTPS `/api/auth/login` and `/api/accessories` endpoints.
- [homebridge-govee](https://github.com/homebridge-plugins/homebridge-govee) or
  [homebridge-unifi-protect](https://github.com/hjdhjd/homebridge-unifi-protect)
  configured with the sensors you want to use.

This module requires a Homebridge UI login, not a Govee developer API key or a
UniFi API token. It has no subscription, paid API, or third-party cloud account
of its own. Hardware and plugin account requirements still apply; consult the
plugin documentation for supported devices, credentials, and any upstream
service limits. The module polls your local Homebridge API at the configured
interval and does not bypass plugin or vendor limitations.

## Supported sensors and desktops

- Govee presence/occupancy sensors exposed by **homebridge-govee**.
- UniFi Protect camera or sensor motion/presence services exposed by
  **homebridge-unifi-protect**.
- Other Homebridge services exposing standard HomeKit Occupancy Detected
  (`00000071`) or Motion Detected (`00000022`) characteristics.
- **Wayland:** compositors supporting the output-management protocol, including
  Raspberry Pi OS labwc, using `/usr/bin/wlr-randr`.
- **X11:** desktops with working DPMS support, using `/usr/bin/xset`.

The module reads the characteristics exposed by Homebridge, not the vendor's
cloud or the Protect API directly. A camera motion service may react to any
motion, not specifically people. Configure the Homebridge plugin's detection
filters separately if required.

`auto` prefers Wayland when both Wayland and XWayland are present. You can
explicitly select either backend. Unsupported compositors, missing commands,
disabled X11 DPMS, and unavailable desktop sessions produce explicit errors;
there is no silent fallback to a different display-control mechanism.

## Behavior

- **Any configured sensor reporting presence wakes the display on the next
  poll**, even if another sensor is unavailable.
- The display turns off only after **all configured sensors report clear
  continuously for five minutes** by default.
- Missing, unreadable, or ambiguous sensors prevent an off decision and reset
  the absence timer. They do not prevent another healthy sensor from waking it.
- Homebridge request failures leave the current display state unchanged and
  reset the absence timer. Long polling gaps also restart the timer.
- The actual output state is queried each poll, rather than assuming that an
  earlier command is still in effect. Failed power commands are reported and
  retried on subsequent polls.
- Stopping or removing the module leaves the display in its current state.
  It does not install a boot service or change desktop power-management policy.

No sensor names are selected by default, and control is **disabled by default**.
This avoids publishing a module that unexpectedly blanks someone else's screen.

## Installation

Requires Node.js 22 or later and a working MagicMirror installation.
The declared minimum is **MagicMirror 2.38.0**, the version used for framework
testing. Older versions have not been certified.

1. Place this directory at `~/MagicMirror/modules/MMM-HomebridgeDisplayControl`.
   To install this release from GitHub:

   ```bash
   cd ~/MagicMirror/modules
   git clone --branch v1.0.0 https://github.com/rroach3753/MMM-HomebridgeDisplayControl.git
   ```

   This checks out the release tag, not a branch that receives automatic updates.
   No npm dependencies are required.
2. Install the command appropriate for your desktop if it is missing:
   `sudo apt install wlr-randr` for Wayland or
   `sudo apt install x11-xserver-utils` for X11.
3. Confirm that your Homebridge UI API exposes the desired services in
   `/api/accessories`. Some Homebridge configurations require insecure mode
   (`-I`) for accessory access. This Homebridge option is distinct from TLS
   certificate verification.
4. Configure the server environment below, add the module to MagicMirror's
   configuration, and restart MagicMirror.

The module runs once on the server, independently of browser connections.
Multiple browser windows do not create competing display-control loops.
It has no visible UI by default, so a screenshot is not applicable to its
normal headless use. The optional status view is a plain text line, not a
dashboard or sensor visualization.

```javascript
{
  module: "MMM-HomebridgeDisplayControl",
  config: {}
}
```

No position is needed for headless operation. To show a small status message:

```javascript
{
  module: "MMM-HomebridgeDisplayControl",
  position: "bottom_left",
  config: {
    showStatus: true
  }
}
```

`showStatus` is the only browser-side option. Credentials, sensor names, timing,
backend selection, and power-control enablement are accepted **only from the
MagicMirror process environment**. Socket messages cannot turn control on or
change its targets.

## Server configuration

Supply variables through your existing PM2 startup script, systemd
`EnvironmentFile`, or shell exports. The module does **not** load `.env` files
automatically. See [.env.example](.env.example).

| Variable | Default | Meaning |
| --- | --- | --- |
| `HBDC_ENABLED` | `false` | Explicit `true` to enable display control |
| `HOMEBRIDGE_URL` | None | HTTPS origin, e.g. `https://homebridge.local:8581` |
| `HOMEBRIDGE_USERNAME` | None | Homebridge UI username |
| `HOMEBRIDGE_PASSWORD` | None | Homebridge UI password |
| `HOMEBRIDGE_VERIFY_SSL` | `true` | Verify the Homebridge TLS certificate |
| `HBDC_SENSOR_NAMES` | `[]` | JSON array of 1-32 exact accessory or service names |
| `HBDC_OFF_DELAY_MS` | `300000` | Continuous absence before off, minimum 1000 ms |
| `HBDC_POLL_INTERVAL_MS` | `15000` | Poll delay after each completed cycle, minimum 1000 ms |
| `HBDC_BACKEND` | `auto` | `auto`, `wayland`, or `x11` |
| `HBDC_OUTPUT` | None | Required Wayland connector; ignored for X11 |

Sensor names are trimmed and matched case-insensitively. A name must select
exactly one occupancy or motion characteristic. If an accessory exposes several
such services, use a unique service name rather than the shared accessory name.
Invalid enabled configuration prevents startup and logs an error.

Example shell configuration for a labwc-based mirror:

```bash
export HBDC_ENABLED=true
export HOMEBRIDGE_URL=https://homebridge.local:8581
export HOMEBRIDGE_USERNAME=your-username
export HOMEBRIDGE_PASSWORD='your-password'
export HBDC_SENSOR_NAMES='["Hallway - Sensor","RMR-G6-ENTRY"]'
export HBDC_OFF_DELAY_MS=300000
export HBDC_POLL_INTERVAL_MS=15000
export HBDC_BACKEND=auto
export HBDC_OUTPUT=HDMI-A-1
```

These names are **examples**, not shipped defaults. Existing `HOMEBRIDGE_*`
credentials from other modules can be reused. The former Govee status module's
`PRESENCE_DISPLAY_*` settings are not used by this module.

### Desktop permissions

Run MagicMirror as the logged-in desktop user, not root. With PM2 or a service,
ensure it inherits the appropriate desktop environment:

- Wayland: `XDG_RUNTIME_DIR` and `WAYLAND_DISPLAY`. When omitted, the module uses
  `/run/user/<current-user-id>` and `wayland-0`.
- X11: `DISPLAY` and, when required, `XAUTHORITY`.

For auto detection, the module checks `WAYLAND_DISPLAY`, `XDG_SESSION_TYPE`,
and the current user's `wayland-0` socket before considering `DISPLAY`.
For other socket names, supply `WAYLAND_DISPLAY` explicitly.

Run `wlr-randr` in the desktop session to find the connector name. There is
deliberately no assumed connector: HDMI port names and monitor arrangements vary.
Only the configured Wayland output is affected. X11 DPMS affects the X server's
monitors collectively; it cannot select an individual connector.

The X11 backend requires `xset q` to show `DPMS is Enabled`. Enabling DPMS or
disabling other idle/blanking programs is an administrator decision, not a
side effect of loading this module. Under Wayland, use the Wayland backend,
not XWayland's `xset`, which generally cannot control physical display power.

### HTTPS and credentials

Plain HTTP, URLs containing credentials, paths, queries, or fragments are
rejected. TLS verification is on by default. Use `NODE_EXTRA_CA_CERTS` for a
private certificate authority. `HOMEBRIDGE_VERIFY_SSL=false` is available for a
trusted self-signed installation but permits interception of credentials and
is not recommended.

Keep environment files private (for example, mode `600`) and out of Git.
Passwords and bearer tokens are never sent to the renderer or logged.
Requests and display commands have 10-second deadlines; response sizes are
bounded. Token expiry and one immediate retry after HTTP 401 are supported.
Shell commands are not constructed from configuration; display utilities run
with fixed argument arrays.

## Troubleshooting

Look for `[MMM-HomebridgeDisplayControl]` in MagicMirror logs. Repeated identical
messages are suppressed until the state changes.

- **Does not wake:** check the exposed sensor value in Homebridge. A sensor
  stuck at a valid clear value cannot be identified as broken; another configured
  sensor can still wake the display.
- **Never turns off:** check for occupied, missing, unreadable, or duplicate
  sensor names. All selected services must be readable and clear.
- **Connection or HTTP error:** check the HTTPS origin, credentials, certificate,
  and Homebridge accessory access permissions.
- **Wayland connection error:** check the desktop user and runtime/socket
  environment. An SSH session may not inherit these variables.
- **Display comes back on unexpectedly:** check other desktop power managers,
  output profiles, HDMI-CEC, and input devices.

For emergency manual recovery on Wayland:

```bash
XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-0 \
  /usr/bin/wlr-randr --output HDMI-A-1 --on
```

Adjust the user ID and connector for your installation. Set `HBDC_ENABLED=false`
and restart MagicMirror to stop automation. This does not itself change the
display's current power state.

## Development and testing

```bash
node --run test
node --run check
```

Tests use Node's built-in test runner and require no installation.
The opt-in [Pi integration test](tests/live-pi.js) reads the configured live
Homebridge sensors and exercises real display off/on with controlled presence
inputs. It restores the initial display state in `finally`, does not change
Homebridge sensor values, and requires `HBDC_LIVE_TEST=true`. Run it only from
an SSH session with manual display recovery available.

X11 command behavior is covered by automated tests. Actual hardware support
depends on the desktop server and monitor.

The Wayland backend has been tested on a Raspberry Pi running labwc using live
Govee occupancy and UniFi Protect motion readings from Homebridge. The reversible
integration test verified physical output off/on and either-sensor wake using
controlled inputs and an accelerated clock for the five-minute threshold. The
helper was also smoke-tested with the installed MagicMirror NodeHelper framework.
The mirror's configuration was not changed, and its initial display state was
restored. X11 has not yet been tested on physical hardware.

During installed operation, the running module observed live UniFi Protect
presence detections and automatically disabled the physical HDMI output after
both configured sensors remained clear for five minutes. This complements the
controlled off/on and either-sensor wake tests above.

## Updating and removing

Stable releases and prereleases are available on the
[GitHub releases page](https://github.com/rroach3753/MMM-HomebridgeDisplayControl/releases).
Review the [changelog](CHANGELOG.md) before upgrading. Preserve your private
server environment outside the module directory and restart MagicMirror.
For a tag-based installation, fetch tags and explicitly check out the desired
release; do not expect `git pull` to upgrade a detached release tag.

For example, to upgrade an existing alpha installation to the stable release:

```bash
cd ~/MagicMirror/modules/MMM-HomebridgeDisplayControl
git fetch origin --tags
git switch --detach v1.0.0
```

Restart MagicMirror afterward using your normal service or process manager.
Preserve any local modifications before switching versions.

To remove the module, delete its entry from MagicMirror's configuration and
restart MagicMirror before removing its directory. Remove unused `HBDC_*`
variables from your startup environment. Leave shared `HOMEBRIDGE_*` credentials
in place if another module uses them. Use the manual recovery command above if
you need the screen on; stopping this module does not alter display power.

## Project files and MagicMirror conventions

The directory and core script share the module's registered name,
`MMM-HomebridgeDisplayControl`. The backend uses `NodeHelper.create`, one
controller per helper, the standard socket API, and `stop()` cleanup for timers,
requests, and child processes. Both entry points declare the same minimum
MagicMirror version. Additional CSS, translations, templates, and a `public/`
directory are not needed for the current plain-text, headless-first interface.

The structure follows the official
[module development guide](https://docs.magicmirror.builders/module-development/introduction.html),
[core module API](https://docs.magicmirror.builders/module-development/core-module-file.html),
and [node helper API](https://docs.magicmirror.builders/module-development/node-helper.html).
Unlike the common pattern of forwarding renderer configuration to the helper,
privileged automation settings intentionally come only from the server
environment.

- [CHANGELOG.md](CHANGELOG.md): release changes and verification scope.
- [LICENSE](LICENSE): MIT license.
- [CONTRIBUTING.md](CONTRIBUTING.md): development and sanitized bug reports.
- [SECURITY.md](SECURITY.md): disclosure and deployment precautions.
- [.env.example](.env.example): non-secret server configuration example.
- [package.json](package.json): version, Node requirement, and validation scripts.
- [tests/](tests/): automated checks and opt-in hardware test.

README, changelog, and community documents support distribution and maintenance;
they are not all mandatory runtime files in the MagicMirror module loader.
