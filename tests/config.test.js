const test = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig } = require("../lib/config");

const enabled = {
  HBDC_ENABLED: "true",
  HOMEBRIDGE_URL: "https://homebridge.example:8581",
  HOMEBRIDGE_USERNAME: "test-user",
  HOMEBRIDGE_PASSWORD: "test-password",
  HBDC_SENSOR_NAMES: '["Hallway - Sensor","RMR-G6-ENTRY"]'
};

test("public defaults disable control and select no sensors", () => {
  assert.deepEqual(loadConfig({}), { enabled: false });
  assert.deepEqual(loadConfig({ HBDC_ENABLED: "false", HOMEBRIDGE_URL: "bad" }), { enabled: false });
  assert.throws(() => loadConfig({ HBDC_ENABLED: "yes" }), /true or false/);
});

test("enabled policy has five-minute delay, verified TLS, auto backend and normalized names", () => {
  const config = loadConfig(enabled);
  assert.equal(config.offDelay, 300000);
  assert.equal(config.pollInterval, 15000);
  assert.equal(config.verifySSL, true);
  assert.equal(config.backend, "auto");
  assert.deepEqual(config.sensors, ["Hallway - Sensor", "RMR-G6-ENTRY"]);
  assert.equal(loadConfig({ ...enabled, HOMEBRIDGE_VERIFY_SSL: "false" }).verifySSL, false);
});

test("invalid or incomplete policy fails explicitly", () => {
  for (const change of [
    { HOMEBRIDGE_URL: "http://homebridge.example" },
    { HOMEBRIDGE_URL: "https://user:secret@homebridge.example" },
    { HOMEBRIDGE_URL: "https://homebridge.example/api" },
    { HOMEBRIDGE_URL: "https://homebridge.example/?key=secret" },
    { HOMEBRIDGE_USERNAME: "" },
    { HOMEBRIDGE_PASSWORD: "" },
    { HBDC_SENSOR_NAMES: "[]" },
    { HBDC_SENSOR_NAMES: '["Hall","hall"]' },
    { HBDC_SENSOR_NAMES: '[""]' },
    { HBDC_SENSOR_NAMES: "{}" },
    { HBDC_SENSOR_NAMES: "invalid" },
    { HBDC_SENSOR_NAMES: "[null]" },
    { HBDC_OFF_DELAY_MS: "999" },
    { HBDC_OFF_DELAY_MS: "Infinity" },
    { HBDC_POLL_INTERVAL_MS: "1.5" },
    { HBDC_POLL_INTERVAL_MS: "2147483648" },
    { HBDC_BACKEND: "shell" },
    { HBDC_OUTPUT: "--help" },
    { HBDC_OUTPUT: "HDMI-A-1; touch /tmp/unsafe" },
    { HOMEBRIDGE_VERIFY_SSL: "" }
  ]) assert.throws(() => loadConfig({ ...enabled, ...change }));
});
