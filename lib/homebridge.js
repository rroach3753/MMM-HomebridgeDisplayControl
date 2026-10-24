const https = require("node:https");

const SENSOR_UUIDS = new Set([
  "00000071-0000-1000-8000-0026BB765291",
  "00000022-0000-1000-8000-0026BB765291"
]);

function sensorValue(value) {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return null;
}

function readSensors(accessories, names) {
  if (!Array.isArray(accessories)) throw new Error("Homebridge accessories response must be an array");
  const matches = new Map(names.map((name) => [name.toLowerCase(), []]));
  for (const accessory of accessories) {
    if (!accessory || !Array.isArray(accessory.serviceCharacteristics)) continue;
    for (const characteristic of accessory.serviceCharacteristics) {
      if (!characteristic || !SENSOR_UUIDS.has(String(characteristic.uuid).toUpperCase())) continue;
      const aliases = new Set([
        accessory.accessoryInformation?.Name,
        accessory.serviceName,
        characteristic.serviceName
      ].filter((name) => typeof name === "string").map((name) => name.trim().toLowerCase()));
      for (const alias of aliases) {
        if (matches.has(alias)) {
          matches.get(alias).push(characteristic.status && characteristic.status !== 0
            ? null : sensorValue(characteristic.value));
        }
      }
    }
  }
  return names.map((name) => {
    const values = matches.get(name.toLowerCase());
    return {
      name,
      value: values.length === 1 ? values[0] : null,
      error: values.length === 0 ? "not found" : values.length > 1
        ? "ambiguous name; use a unique service name" : values[0] === null ? "unreadable value" : null
    };
  });
}

class HomebridgeClient {
  constructor(config) {
    this.config = config;
    this.token = null;
    this.expiresAt = 0;
    this.requests = new Set();
    this.closed = false;
  }

  request(path, method, body, token) {
    if (this.closed) return Promise.reject(new Error("Homebridge client stopped"));
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const headers = { Accept: "application/json" };
      if (data) {
        headers["Content-Type"] = "application/json";
        headers["Content-Length"] = Buffer.byteLength(data);
      }
      if (token) headers.Authorization = `Bearer ${token}`;
      const request = https.request(new URL(path, this.config.origin), {
        method, headers, rejectUnauthorized: this.config.verifySSL
      }, (response) => {
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > 4 * 1024 * 1024) {
            request.destroy(new Error("Homebridge response exceeds 4 MiB"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            const error = new Error(`Homebridge ${path} returned HTTP ${response.statusCode}` +
              (response.statusCode === 403 ? "; accessory access may require Homebridge insecure mode (-I)" : ""));
            error.statusCode = response.statusCode;
            reject(error);
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error(`Homebridge ${path} returned invalid JSON`));
          }
        });
      });
      this.requests.add(request);
      const deadline = setTimeout(() => request.destroy(new Error("Homebridge request timed out")), 10000);
      request.on("close", () => {
        clearTimeout(deadline);
        this.requests.delete(request);
      });
      request.on("error", reject);
      request.end(data);
    });
  }

  async authenticate() {
    const auth = await this.request("/api/auth/login", "POST", {
      username: this.config.username, password: this.config.password
    });
    if (!auth || typeof auth.access_token !== "string" || !auth.access_token) {
      throw new Error("Homebridge login did not return an access token");
    }
    const seconds = Number(auth.expires_in);
    this.token = auth.access_token;
    this.expiresAt = Date.now() + (Number.isFinite(seconds) && seconds > 0
      ? Math.max(0, seconds - Math.min(300, seconds / 2)) * 1000 : 0);
  }

  async read() {
    if (!this.token || Date.now() >= this.expiresAt) await this.authenticate();
    let accessories;
    try {
      accessories = await this.request("/api/accessories", "GET", null, this.token);
    } catch (error) {
      if (error.statusCode !== 401) throw error;
      this.token = null;
      await this.authenticate();
      accessories = await this.request("/api/accessories", "GET", null, this.token);
    }
    return readSensors(accessories, this.config.sensors);
  }

  close() {
    this.closed = true;
    for (const request of this.requests) request.destroy(new Error("Homebridge client stopped"));
    this.token = null;
  }
}

module.exports = { HomebridgeClient, readSensors };
