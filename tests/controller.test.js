const test = require("node:test");
const assert = require("node:assert/strict");
const { Controller } = require("../lib/controller");

function harness() {
  let now = 0;
  let readings = [{ name: "Govee", value: false }, { name: "Protect", value: false }];
  let on = true;
  let readError;
  let writeError;
  const writes = [];
  const reports = [];
  const client = {
    read: async () => { if (readError) throw readError; return readings; },
    close() {}
  };
  const display = {
    isOn: async () => on,
    setPower: async (value) => {
      if (writeError) throw writeError;
      writes.push(value);
      on = value;
    },
    close() {}
  };
  const controller = new Controller({ offDelay: 300000, pollInterval: 15000 },
    client, display, (status) => reports.push(status), () => now);
  return {
    controller, client, display, writes, reports,
    time(value) { now = value; },
    readings(value) { readings = value.map((v, i) => ({ name: `sensor${i}`, value: v, error: v === null ? "not found" : null })); },
    on(value) { on = value; },
    readError(value) { readError = value; },
    writeError(value) { writeError = value; },
    async poll() { clearTimeout(controller.timer); await controller.poll(); clearTimeout(controller.timer); }
  };
}

test("all sensors must stay clear for exactly five minutes; either sensor wakes immediately", async () => {
  const h = harness();
  try {
    await h.poll();
    for (let time = 15000; time < 300000; time += 15000) {
      h.time(time); await h.poll();
    }
    h.time(299999); await h.poll();
    assert.deepEqual(h.writes, []);
    h.time(300000); await h.poll();
    assert.deepEqual(h.writes, [false]);
    h.readings([false, true]); h.time(315000); await h.poll();
    assert.deepEqual(h.writes, [false, true]);
    assert.equal(h.controller.absentSince, null);
    await h.poll();
    assert.equal(h.writes.length, 2);
    h.on(false); h.readings([true, false]); await h.poll();
    assert.deepEqual(h.writes, [false, true, true]);
  } finally { h.controller.stop(); }
});

test("unknown sensors block off but never block another sensor waking the display", async () => {
  const h = harness();
  try {
    await h.poll();
    h.time(15000); h.readings([false, null]); await h.poll();
    assert.equal(h.controller.absentSince, null);
    assert.equal(h.reports.at(-1).level, "warn");
    h.on(false); h.readings([null, true]); await h.poll();
    assert.deepEqual(h.writes, [true]);
    h.time(30000); h.readings([false, false]); await h.poll();
    assert.equal(h.controller.absentSince, 30000);
  } finally { h.controller.stop(); }
});

test("network failure and long sampling gaps reset continuous absence", async () => {
  const h = harness();
  try {
    await h.poll();
    h.readError(new Error("Homebridge offline")); h.time(15000); await h.poll();
    assert.equal(h.controller.absentSince, null);
    assert.match(h.reports.at(-1).message, /offline/);
    h.readError(null); h.time(30000); await h.poll();
    assert.equal(h.controller.absentSince, 30000);
    h.time(600000); await h.poll();
    assert.equal(h.controller.absentSince, 600000);
    assert.deepEqual(h.writes, []);
  } finally { h.controller.stop(); }
});

test("failed display commands are reported and retried, never cached as successful", async () => {
  const h = harness();
  try {
    h.on(false); h.readings([true, false]); h.writeError(new Error("Wayland unavailable"));
    await h.poll();
    assert.equal(h.reports.at(-1).level, "error");
    assert.deepEqual(h.writes, []);
    h.writeError(null); await h.poll();
    assert.deepEqual(h.writes, [true]);
  } finally { h.controller.stop(); }
});

test("stopping during an in-flight request prevents late power changes and rescheduling", async () => {
  const h = harness();
  let complete;
  let closes = 0;
  h.client.read = () => new Promise((resolve) => { complete = resolve; });
  h.client.close = () => { closes++; };
  h.display.close = () => { closes++; };
  const pending = h.controller.poll();
  await h.controller.poll();
  h.controller.stop();
  complete([{ name: "Govee", value: true }]);
  await pending;
  assert.equal(closes, 2);
  assert.equal(h.controller.timer, null);
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.reports, []);
});
