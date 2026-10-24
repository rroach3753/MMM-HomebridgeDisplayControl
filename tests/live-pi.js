const assert = require("node:assert/strict");
const { setTimeout: sleep } = require("node:timers/promises");
const { loadConfig } = require("../lib/config");
const { HomebridgeClient } = require("../lib/homebridge");
const { Display } = require("../lib/display");
const { Controller } = require("../lib/controller");

async function main() {
  if (process.env.HBDC_LIVE_TEST !== "true") {
    throw new Error("Set HBDC_LIVE_TEST=true to permit a real display off/on test");
  }
  const config = loadConfig();
  if (!config.enabled) throw new Error("Provide enabled server policy for this test");
  const display = new Display(config);
  const client = new HomebridgeClient(config);
  const initiallyOn = await display.isOn();
  console.log(JSON.stringify({ backend: display.backend, output: display.output, initiallyOn }));
  let controller;
  let restoring = false;
  const restore = async () => {
    if (restoring) return;
    restoring = true;
    controller?.stop();
    client.close();
    try {
      await display.setPower(initiallyOn);
      assert.equal(await display.isOn(), initiallyOn);
      console.log("RESTORED initial display state:", initiallyOn ? "on" : "off");
    } finally {
      display.close();
    }
  };
  const interrupt = () => {
    restore().then(() => process.exit(1), (error) => {
      console.error("RESTORATION FAILED:", error.message);
      process.exit(1);
    });
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  try {
    const live = await client.read();
    console.log("LIVE Homebridge readings:", JSON.stringify(live));
    assert.equal(live.length, config.sensors.length);
    assert.ok(live.every((sensor) => typeof sensor.value === "boolean"),
      "Every configured live sensor must be readable");

    await display.setPower(true);
    const testDisplay = new Display(config);
    let now = 0;
    let values = config.sensors.map(() => false);
    controller = new Controller(config, {
      read: async () => config.sensors.map((name, i) => ({
        name, value: values[i], error: values[i] === null ? "simulated unavailable sensor" : null
      })),
      close() {}
    }, testDisplay, (status) => {
      console.log("CONTROLLER:", status.message);
      if (status.level === "error") throw new Error(status.message);
    }, () => now);
    const poll = async () => {
      clearTimeout(controller.timer);
      await controller.poll();
      clearTimeout(controller.timer);
    };
    await poll();
    assert.equal(await display.isOn(), true);
    for (now = config.pollInterval; now < config.offDelay; now += config.pollInterval) await poll();
    now = config.offDelay - 1;
    await poll();
    assert.equal(await display.isOn(), true, "Must stay on before the exact absence threshold");
    now = config.offDelay;
    await poll();
    assert.equal(await display.isOn(), false, "All clear at the threshold must turn the real output off");
    await sleep(2000);
    values[values.length - 1] = true;
    now += config.pollInterval;
    await poll();
    assert.equal(await display.isOn(), true, "Last sensor must wake the real output");
    values = config.sensors.map(() => null);
    await poll();
    assert.equal(await display.isOn(), true, "Unknown readings must not turn the display off");
    await display.setPower(false);
    values[0] = true;
    await poll();
    assert.equal(await display.isOn(), true, "First sensor must wake even when others are unknown");
    console.log("PASS: live API, real output control, exact absence threshold, either-sensor wake, unknown-reading safety");
  } finally {
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", interrupt);
    await restore();
  }
}

main().catch((error) => {
  console.error("LIVE TEST FAILED:", error.message);
  process.exitCode = 1;
});
