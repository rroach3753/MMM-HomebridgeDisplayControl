/* global Module */
Module.register("MMM-HomebridgeDisplayControl", {
  requiresVersion: "2.38.0",

  defaults: {
    showStatus: false
  },

  start: function () {
    this.status = "Waiting for display controller";
    this.sendSocketNotification("HBDC_SUBSCRIBE");
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "HBDC_STATUS" && payload && typeof payload.message === "string") {
      this.status = payload.message;
      if (this.config.showStatus) this.updateDom();
    }
  },

  getDom: function () {
    const element = document.createElement("div");
    if (this.config.showStatus) {
      element.className = "small dimmed";
      element.textContent = this.status;
    }
    return element;
  }
});
