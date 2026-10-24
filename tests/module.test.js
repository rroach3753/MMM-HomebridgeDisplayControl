const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadConfig } = require("../lib/config");

test("frontend status is plain text and never submits control configuration", () => {
  let module;
  let updates = 0;
  const sent = [];
  const source = fs.readFileSync(path.join(__dirname, "..", "MMM-HomebridgeDisplayControl.js"), "utf8");
  vm.runInNewContext(source, {
    Module: { register: (_name, definition) => { module = definition; } },
    document: { createElement: () => ({ textContent: "" }) }
  });
  module.config = { showStatus: false };
  assert.equal(module.requiresVersion, "2.38.0");
  module.updateDom = () => { updates++; };
  module.sendSocketNotification = (...args) => sent.push(args);
  module.start();
  assert.equal(sent.length, 1);
  assert.equal(sent[0][0], "HBDC_SUBSCRIBE");
  assert.equal(sent[0].length, 1);
  module.socketNotificationReceived("HBDC_STATUS", { message: "<script>not markup</script>" });
  assert.equal(updates, 0);
  assert.equal(module.getDom().textContent, "");
  module.config.showStatus = true;
  module.socketNotificationReceived("HBDC_STATUS", { message: "<script>not markup</script>" });
  assert.equal(updates, 1);
  assert.equal(module.getDom().textContent, "<script>not markup</script>");
  module.socketNotificationReceived("HBDC_STATUS", {});
  assert.equal(updates, 1);
});

test("node helper is server-only, disabled by default, and stops its previous loop on restart", () => {
  let enabled = false;
  let polls = 0;
  let stops = 0;
  let displayCreations = 0;
  const statuses = [];
  const env = {
    HBDC_ENABLED: "true",
    HOMEBRIDGE_URL: "https://homebridge.example",
    HOMEBRIDGE_USERNAME: "user",
    HOMEBRIDGE_PASSWORD: "secret",
    HBDC_SENSOR_NAMES: '["Hall"]',
    HBDC_OUTPUT: "HDMI-A-1"
  };
  const imports = {
    node_helper: { create: (definition) => definition },
    "./lib/config": { loadConfig: () => loadConfig(enabled ? env : {}) },
    "./lib/homebridge": { HomebridgeClient: class {} },
    "./lib/display": { Display: class {
      constructor() { displayCreations++; this.backend = "wayland"; }
    } },
    "./lib/controller": { Controller: class {
      poll() { polls++; }
      stop() { stops++; }
    } }
  };
  const context = {
    require: (name) => imports[name],
    module: { exports: {} },
    console: { log() {}, warn() {}, error() {} }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "node_helper.js"), "utf8"), context);
  const helper = context.module.exports;
  assert.equal(helper.requiresVersion, "2.38.0");
  helper.sendSocketNotification = (name, payload) => statuses.push({ name, payload });
  helper.start();
  assert.equal(displayCreations, 0);
  assert.equal(statuses.length, 0, "helper can start before socket.io is attached");
  helper.io = {};
  helper.socketNotificationReceived("HBDC_SUBSCRIBE");
  assert.match(statuses[0].payload.message, /disabled/);
  enabled = true;
  helper.start();
  helper.start();
  assert.equal(polls, 2);
  assert.equal(stops, 1);
  helper.stop();
  assert.equal(stops, 2);
  helper.socketNotificationReceived("CONFIG", { HBDC_ENABLED: true });
  assert.equal(polls, 2, "renderer messages cannot start a loop");
  assert.ok(!JSON.stringify(statuses).includes("secret"));
});

test("distribution includes entry points, metadata, documentation and non-secret configuration example", () => {
  const root = path.join(__dirname, "..");
  for (const file of [
    "MMM-HomebridgeDisplayControl.js", "node_helper.js", "README.md",
    "CHANGELOG.md", "LICENSE", "CONTRIBUTING.md", "SECURITY.md",
    ".env.example", ".gitignore", "package.json"
  ]) {
    assert.ok(fs.statSync(path.join(root, file)).isFile(), `${file} must exist`);
    assert.ok(fs.readFileSync(path.join(root, file), "utf8").trim(), `${file} must not be empty`);
  }
  const metadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(metadata.main, "MMM-HomebridgeDisplayControl.js");
  assert.equal(metadata.license, "MIT");
  assert.equal(metadata.engines.node, ">=22");
  assert.match(metadata.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(metadata.scripts.test, "node --test tests/*.test.js");
  const sample = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  assert.match(sample, /^HBDC_ENABLED=false$/m);
  assert.match(sample, /^HBDC_SENSOR_NAMES=\[\]$/m);
});
