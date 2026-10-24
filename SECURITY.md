# Security policy

This project is in alpha. Security fixes target the latest alpha and main branch.

## Reporting

Use the repository's private vulnerability reporting feature if enabled.
Otherwise contact the repository maintainer privately to arrange disclosure.
A dedicated security contact has not yet been published;
do not post credentials, sensitive logs, or exploitable details in a public issue.

Include affected versions, prerequisites, impact, and minimal reproduction steps
using synthetic credentials and sensor names.

## Deployment precautions

- Run as the desktop user, not root.
- Keep credentials and display-control policy in the server environment.
- Use HTTPS with certificate verification and keep secret files private.
- Restrict access to the Homebridge UI/API and MagicMirror server.
- Maintain a manual display recovery path before enabling automation.
- Use this only for convenience automation, not safety-critical occupancy
  monitoring. A valid clear reading cannot prove that a sensor is healthy.

See [README.md](README.md#https-and-credentials) for configuration details.
