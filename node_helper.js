const NodeHelper = require("node_helper");
const { loadConfig } = require("./lib/config");
const { HomebridgeClient } = require("./lib/homebridge");
const { Display } = require("./lib/display");
const { Controller } = require("./lib/controller");

module.exports = NodeHelper.create({
  requiresVersion: "2.38.0",

  start: function () {
    this.stop();
    this.lastMessage = null;
    try {
      const config = loadConfig();
      if (!config.enabled) {
        this.report({ level: "info", message: "Display control disabled; set HBDC_ENABLED=true to enable" });
        return;
      }
      if (!config.verifySSL) {
        console.warn("[MMM-HomebridgeDisplayControl] TLS certificate verification disabled by server policy");
      }
      const display = new Display(config);
      this.controller = new Controller(config, new HomebridgeClient(config), display,
        (status) => this.report(status));
      console.log(`[MMM-HomebridgeDisplayControl] Starting ${display.backend} display controller with ${config.sensors.length} sensors`);
      this.controller.poll();
    } catch (error) {
      this.report({ level: "error", message: error.message });
    }
  },

  report: function (status) {
    if (status.message !== this.lastMessage) {
      const log = status.level === "error" ? console.error : status.level === "warn" ? console.warn : console.log;
      log(`[MMM-HomebridgeDisplayControl] ${status.message}`);
      this.lastMessage = status.message;
    }
    if (this.io) this.sendSocketNotification("HBDC_STATUS", { message: status.message });
  },

  socketNotificationReceived: function (notification) {
    if (notification === "HBDC_SUBSCRIBE" && this.lastMessage) {
      this.sendSocketNotification("HBDC_STATUS", { message: this.lastMessage });
    }
  },

  stop: function () {
    this.controller?.stop();
    this.controller = null;
  }
});
