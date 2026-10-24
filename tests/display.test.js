const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { Display } = require("../lib/display");

function harness(backend) {
  const calls = [];
  let on = true;
  let fail = false;
  const execute = (command, args, options, callback) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.kill = () => {};
    queueMicrotask(() => {
      if (args.includes("--on") || args.includes("on")) on = true;
      if (args.includes("--off") || args.includes("off")) on = false;
      const stdout = backend === "wayland"
        ? `HDMI-A-1 "Monitor"\n  Enabled: ${on ? "yes" : "no"}\nOTHER "Other"\n  Enabled: yes\n`
        : `DPMS is Enabled\n  Monitor is ${on ? "On" : "Off"}\n`;
      callback(fail ? new Error("failed") : null, stdout, fail ? "display inaccessible" : "");
      child.emit("close");
    });
    return child;
  };
  const display = new Display({ backend, output: "HDMI-A-1" }, { DISPLAY: ":0" }, execute);
  return { display, calls, fail: () => { fail = true; } };
}

for (const backend of ["wayland", "x11"]) {
  test(`${backend} queries actual state, uses fixed commands without a shell and verifies power changes`, async () => {
    const { display, calls, fail } = harness(backend);
    assert.equal(await display.isOn(), true);
    await display.setPower(false);
    assert.equal(await display.isOn(), false);
    await display.setPower(true);
    assert.equal(await display.isOn(), true);
    assert.equal(calls[0].command, backend === "wayland" ? "/usr/bin/wlr-randr" : "/usr/bin/xset");
    assert.equal(calls[0].options.timeout, 10000);
    assert.equal(calls[0].options.shell, undefined);
    fail();
    await assert.rejects(display.isOn(), /display inaccessible/);
    display.close();
    await assert.rejects(display.isOn(), /stopped/);
  });
}

test("auto prefers Wayland over XWayland and explicit override works", () => {
  const env = { WAYLAND_DISPLAY: "wayland-1", DISPLAY: ":0" };
  const config = { backend: "auto", output: "HDMI-A-1" };
  assert.equal(new Display(config, env).backend, "wayland");
  assert.equal(new Display({ ...config, backend: "x11" }, env).backend, "x11");
  assert.equal(new Display(config, { XDG_RUNTIME_DIR: "/nonexistent/hbdc-test", DISPLAY: ":0" }).backend, "x11");
  assert.throws(() => new Display(config, { XDG_RUNTIME_DIR: "/nonexistent/hbdc-test" }), /Cannot detect/);
  assert.throws(() => new Display({ backend: "wayland" }, env), /HBDC_OUTPUT/);
  assert.throws(() => new Display({ backend: "x11" }, {}), /DISPLAY/);
});

test("missing connector, disabled DPMS and failed verification are explicit errors", async () => {
  const stub = (text) => (_command, _args, _opts, callback) => {
    const child = new EventEmitter();
    queueMicrotask(() => { callback(null, text, ""); child.emit("close"); });
    return child;
  };
  const wayland = new Display({ backend: "wayland", output: "missing" }, {}, stub('HDMI-A-1 "Monitor"\n  Enabled: yes\n'));
  await assert.rejects(wayland.isOn(), /not found/);
  const x11 = new Display({ backend: "x11" }, { DISPLAY: ":0" }, stub("Server does not have the DPMS Extension"));
  await assert.rejects(x11.isOn(), /unavailable or disabled/);
  const stuck = new Display({ backend: "wayland", output: "HDMI-A-1" }, {}, stub('HDMI-A-1 "Monitor"\n  Enabled: yes\n'));
  await assert.rejects(stuck.setPower(false), /did not reach/);
});
