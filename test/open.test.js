const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");

function loadPlugin() {
  const required = [];
  const moduleMock = { exports: {} };
  vm.runInNewContext(source, {
    module: moduleMock,
    require: (name) => {
      required.push(name);
      if (name === "obsidian") {
        return {
          Plugin: class { register() {} registerMarkdownPostProcessor() {} registerEditorExtension() {} addSettingTab() {} async loadData() { return {}; } async saveData() {} },
          PluginSettingTab: class { constructor() { this.containerEl = { empty() {}, }; } },
          Setting: class {
            setName() { return this; }
            setDesc() { return this; }
            addDropdown() { return this; }
            addToggle() { return this; }
          },
          Notice: class {},
          Platform: { isMacOS: true, isIosApp: false },
          MarkdownView: class {},
          openExternal: async () => {},
        };
      }
      if (name === "@codemirror/view") {
        return {
          Decoration: { replace: (value) => value },
          ViewPlugin: { fromClass: () => ({}) },
          WidgetType: class {},
        };
      }
      if (name === "@codemirror/state") {
        return { RangeSetBuilder: class { add() {} finish() { return []; } } };
      }
      throw new Error(`Unexpected require: ${name}`);
    },
    document: { addEventListener() {}, removeEventListener() {}, body: {}, createElement: () => ({ addEventListener() {}, setAttribute() {} }) },
    console,
  });
  return { Plugin: moduleMock.exports, required };
}

test("loads without Node or Electron APIs", () => {
  const { required } = loadPlugin();
  assert.deepEqual(required, ["obsidian", "@codemirror/view", "@codemirror/state"]);
});

test("builds Google Maps and Apple Maps URLs from location text", async () => {
  const { Plugin } = loadPlugin();
  const plugin = new Plugin();
  plugin.settings = { mapProvider: "google", useAppleMapsApp: false };
  assert.equal(
    plugin.buildMapUrl("Golden Gate Park"),
    "https://www.google.com/maps/search/?api=1&query=Golden%20Gate%20Park"
  );
  plugin.settings.mapProvider = "apple";
  assert.equal(
    plugin.buildMapUrl("Golden Gate Park"),
    "https://maps.apple.com/?q=Golden%20Gate%20Park"
  );
});
