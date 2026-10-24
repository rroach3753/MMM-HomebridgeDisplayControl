const test = require("node:test");
const assert = require("node:assert/strict");
const https = require("node:https");
const { EventEmitter } = require("node:events");
const { HomebridgeClient, readSensors } = require("../lib/homebridge");

function sensor(name, value, uuid = "00000071-0000-1000-8000-0026BB765291", status) {
  return {
    accessoryInformation: { Name: name },
    serviceCharacteristics: [{ uuid, serviceName: name, value, status }]
  };
}

test("Govee occupancy and Protect motion use their standard HomeKit characteristics", () => {
  const names = ["Hallway - Sensor", "RMR-G6-ENTRY"];
  const readings = readSensors([
    sensor(names[0], 0),
    sensor(names[1], true, "00000022-0000-1000-8000-0026BB765291"),
    { accessoryInformation: { Name: names[1] }, serviceCharacteristics: [] }
  ], names);
  assert.deepEqual(readings, [
    { name: names[0], value: false, error: null },
    { name: names[1], value: true, error: null }
  ]);
  assert.throws(() => readSensors({}, names), /must be an array/);
});

test("missing, invalid, errored and ambiguous sensors are unknown rather than clear", () => {
  for (const value of [null, undefined, "", "unavailable", 2, -70402]) {
    assert.equal(readSensors([sensor("Hall", value)], ["Hall"])[0].value, null);
  }
  assert.equal(readSensors([], ["Hall"])[0].error, "not found");
  assert.equal(readSensors([sensor("Hall", 1, undefined, -70402)], ["Hall"])[0].value, null);
  assert.match(readSensors([sensor("Hall", 0), sensor("Hall", 1)], ["Hall"])[0].error, /ambiguous/);
});

test("unique service names work when an accessory has several sensors", () => {
  const accessory = sensor("Camera", 0);
  accessory.serviceCharacteristics[0].serviceName = "Camera Motion";
  accessory.serviceCharacteristics.push({
    uuid: "00000071-0000-1000-8000-0026BB765291", serviceName: "Camera Person", value: "1"
  });
  const result = readSensors([accessory], ["Camera", "camera motion", "Camera Person"]);
  assert.equal(result[0].value, null);
  assert.equal(result[1].value, false);
  assert.equal(result[2].value, true);
});

test("cached tokens refresh on expiry and retry exactly once on 401", async () => {
  const client = new HomebridgeClient({ sensors: ["Hall"], username: "user", password: "password" });
  const calls = [];
  let logins = 0;
  let rejectToken = true;
  client.request = async (path) => {
    calls.push(path);
    if (path.includes("login")) return { access_token: `token-${++logins}`, expires_in: 3600 };
    if (rejectToken) {
      rejectToken = false;
      const error = new Error("Unauthorized");
      error.statusCode = 401;
      throw error;
    }
    return [sensor("Hall", 1)];
  };
  assert.equal((await client.read())[0].value, true);
  assert.equal(logins, 2);
  await client.read();
  assert.equal(logins, 2);
  client.expiresAt = 0;
  await client.read();
  assert.equal(logins, 3);
  assert.equal(calls.length, 7);
  client.close();
});

test("non-authentication errors are not masked by re-login", async () => {
  const client = new HomebridgeClient({ sensors: ["Hall"] });
  client.token = "cached";
  client.expiresAt = Date.now() + 10000;
  let requests = 0;
  client.request = async () => { requests++; throw new Error("Connection refused"); };
  await assert.rejects(client.read(), /Connection refused/);
  assert.equal(requests, 1);
});

test("HTTPS transport verifies TLS, caps responses and does not expose response bodies on errors", async () => {
  const original = https.request;
  let status = 200;
  let responseBody = JSON.stringify({ ok: true });
  let options;
  let body;
  let url;
  https.request = (target, opts, callback) => {
    url = target;
    options = opts;
    const request = new EventEmitter();
    request.destroy = (error) => { request.emit("error", error); request.emit("close"); };
    request.end = (data) => {
      body = data;
      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = status;
        callback(response);
        response.emit("data", Buffer.from(responseBody));
        response.emit("end");
        request.emit("close");
      });
    };
    return request;
  };
  const client = new HomebridgeClient({ origin: "https://trusted.example:8581", verifySSL: true });
  try {
    assert.deepEqual(await client.request("/api/auth/login", "POST", { username: "user" }), { ok: true });
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(url.origin, "https://trusted.example:8581");
    assert.equal(JSON.parse(body).username, "user");
    status = 403;
    responseBody = '{"password":"never log this"}';
    await assert.rejects(client.request("/api/accessories", "GET"), (error) =>
      error.statusCode === 403 && error.message.includes("insecure mode") && !error.message.includes("password"));
    status = 200;
    responseBody = "not JSON";
    await assert.rejects(client.request("/api/accessories", "GET"), /invalid JSON/);
    responseBody = "a".repeat(4 * 1024 * 1024 + 1);
    await assert.rejects(client.request("/api/accessories", "GET"), /exceeds 4 MiB/);
    client.close();
    await assert.rejects(client.request("/api/accessories", "GET"), /stopped/);
  } finally {
    client.close();
    https.request = original;
  }
});
