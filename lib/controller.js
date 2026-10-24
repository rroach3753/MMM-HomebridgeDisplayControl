class Controller {
  constructor(config, client, display, report, now = Date.now) {
    this.config = config;
    this.client = client;
    this.display = display;
    this.report = report;
    this.now = now;
    this.absentSince = null;
    this.lastReading = null;
    this.timer = null;
    this.stopped = false;
    this.running = false;
  }

  async poll() {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      const readings = await this.client.read();
      if (this.stopped) return;
      const now = this.now();
      if (this.lastReading !== null && now - this.lastReading > this.config.pollInterval * 2 + 30000) {
        this.absentSince = null;
      }
      this.lastReading = now;
      const present = readings.some((sensor) => sensor.value === true);
      const unavailable = readings.filter((sensor) => sensor.value === null);
      let desired = null;
      if (present) {
        this.absentSince = null;
        desired = true;
      } else if (unavailable.length) {
        this.absentSince = null;
      } else {
        if (this.absentSince === null) this.absentSince = now;
        if (now - this.absentSince >= this.config.offDelay) desired = false;
      }
      const actual = await this.display.isOn();
      if (this.stopped) return;
      if (desired !== null && desired !== actual) {
        await this.display.setPower(desired);
        if (this.stopped) return;
      }
      const missing = unavailable.map((sensor) => `${sensor.name} (${sensor.error})`).join(", ");
      this.report({
        level: unavailable.length ? "warn" : "info",
        message: `${desired === null ? actual ? "Display on" : "Display off" : desired ? "Display on" : "Display off"}; ` +
          (present ? "presence detected" : unavailable.length ? "absence timer paused" : "all sensors clear") +
          (missing ? `; unavailable: ${missing}` : ""),
        readings
      });
    } catch (error) {
      this.absentSince = null;
      this.lastReading = null;
      if (!this.stopped) this.report({ level: "error", message: error.message });
    } finally {
      this.running = false;
      if (!this.stopped) {
        this.timer = setTimeout(() => this.poll(), this.config.pollInterval);
        this.timer.unref?.();
      }
    }
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.client.close();
    this.display.close();
  }
}

module.exports = { Controller };
