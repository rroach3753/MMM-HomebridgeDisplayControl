function booleanSetting(env, key, fallback) {
  const raw = env[key];
  if (raw === undefined) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${key} must be true or false`);
}

function numberSetting(env, key, fallback, minimum) {
  const raw = env[key] === undefined ? fallback : env[key];
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > 2147483647) {
    throw new Error(`${key} must be an integer between ${minimum} and 2147483647`);
  }
  return value;
}

function loadConfig(env = process.env) {
  if (!booleanSetting(env, "HBDC_ENABLED", false)) return { enabled: false };
  let origin;
  try {
    origin = new URL(env.HOMEBRIDGE_URL);
  } catch {
    throw new Error("HOMEBRIDGE_URL must be an HTTPS origin");
  }
  if (origin.protocol !== "https:" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("HOMEBRIDGE_URL must be an HTTPS origin without credentials, path, query, or fragment");
  }
  if (!env.HOMEBRIDGE_USERNAME?.trim() || !env.HOMEBRIDGE_PASSWORD) {
    throw new Error("HOMEBRIDGE_USERNAME and HOMEBRIDGE_PASSWORD are required");
  }
  let sensors;
  try {
    sensors = JSON.parse(env.HBDC_SENSOR_NAMES || "[]");
  } catch {
    throw new Error("HBDC_SENSOR_NAMES must be a JSON array of sensor names");
  }
  if (!Array.isArray(sensors) || sensors.length === 0 || sensors.length > 32 ||
      sensors.some((name) => typeof name !== "string" || !name.trim() || name.length > 256)) {
    throw new Error("HBDC_SENSOR_NAMES must contain 1 through 32 nonempty sensor names");
  }
  sensors = sensors.map((name) => name.trim());
  if (new Set(sensors.map((name) => name.toLowerCase())).size !== sensors.length) {
    throw new Error("HBDC_SENSOR_NAMES must not contain duplicate names");
  }
  const backend = env.HBDC_BACKEND || "auto";
  if (!["auto", "wayland", "x11"].includes(backend)) {
    throw new Error("HBDC_BACKEND must be auto, wayland, or x11");
  }
  const output = (env.HBDC_OUTPUT || "").trim();
  if (output && !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(output)) {
    throw new Error("HBDC_OUTPUT must be a connector name such as HDMI-A-1");
  }
  return {
    enabled: true,
    origin: origin.origin,
    username: env.HOMEBRIDGE_USERNAME.trim(),
    password: env.HOMEBRIDGE_PASSWORD,
    verifySSL: booleanSetting(env, "HOMEBRIDGE_VERIFY_SSL", true),
    sensors,
    backend,
    output,
    offDelay: numberSetting(env, "HBDC_OFF_DELAY_MS", 300000, 1000),
    pollInterval: numberSetting(env, "HBDC_POLL_INTERVAL_MS", 15000, 1000)
  };
}

module.exports = { loadConfig };
