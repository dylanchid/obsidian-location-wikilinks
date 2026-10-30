const obsidian = require("obsidian");
const cmView = require("@codemirror/view");
const cmState = require("@codemirror/state");

const { Plugin, PluginSettingTab, Setting, Notice, Platform, MarkdownView, openExternal } = obsidian;
const { Decoration, ViewPlugin, WidgetType } = cmView;
const { RangeSetBuilder } = cmState;

const DEFAULT_SETTINGS = {
	mapProvider: "apple",
	useAppleMapsApp: true
};

const LOCATION_LINK_RE = /\[\[\*([^\]\|\n]+?)(?:\|([^\]\n]+?))?\]\]/g;

function cleanLocation(value) {
	if (!value) return null;
	const location = value.trim();
	return location.length > 0 ? location : null;
}

function decodeTarget(value) {
	try {
		return decodeURIComponent(value);
	} catch (_error) {
		return value;
	}
}

function locationFromTarget(value) {
	if (!value) return null;
	const target = decodeTarget(value).trim();
	if (!target.startsWith("*")) return null;
	return cleanLocation(target.slice(1));
}

function selectionOverlaps(state, from, to) {
	return state.selection.ranges.some((range) => range.from <= to && range.to >= from);
}

class LocationLinkWidget extends WidgetType {
	constructor(plugin, location, label) {
		super();
		this.plugin = plugin;
		this.location = location;
		this.label = label;
	}

	eq(other) {
		return other.location === this.location && other.label === this.label;
	}

	toDOM() {
		const anchor = document.createElement("a");
		anchor.className = "location-wikilink cm-location-wikilink";
		anchor.textContent = this.label;
		anchor.href = this.plugin.buildMapUrl(this.location);
		anchor.title = `Open "${this.location}" in ${this.plugin.getProviderName()}`;
		anchor.setAttribute("aria-label", anchor.title);
		anchor.addEventListener("mousedown", (event) => event.preventDefault());
		anchor.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.plugin.openLocation(this.location);
		});
		return anchor;
	}

	ignoreEvent() {
		return true;
	}
}

function buildEditorDecorations(view, plugin) {
	const builder = new RangeSetBuilder();

	for (const range of view.visibleRanges) {
		const text = view.state.doc.sliceString(range.from, range.to);
		LOCATION_LINK_RE.lastIndex = 0;

		let match;
		while ((match = LOCATION_LINK_RE.exec(text)) !== null) {
			const location = cleanLocation(match[1]);
			if (!location) continue;

			const from = range.from + match.index;
			const to = from + match[0].length;
			if (selectionOverlaps(view.state, from, to)) continue;

			const label = cleanLocation(match[2]) || location;
			builder.add(from, to, Decoration.replace({
				widget: new LocationLinkWidget(plugin, location, label)
			}));
		}
	}

	return builder.finish();
}

function createEditorExtension(plugin) {
	return ViewPlugin.fromClass(class {
		constructor(view) {
			this.decorations = buildEditorDecorations(view, plugin);
		}

		update(update) {
			if (update.docChanged || update.viewportChanged || update.selectionSet) {
				this.decorations = buildEditorDecorations(update.view, plugin);
			}
		}
	}, {
		decorations: (viewPlugin) => viewPlugin.decorations
	});
}

class LocationWikilinksSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Location Wikilinks" });

		new Setting(containerEl)
			.setName("Map provider")
			.setDesc("Choose where [[*location]] links open.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("apple", "Apple Maps")
					.addOption("google", "Google Maps")
					.setValue(this.plugin.settings.mapProvider)
					.onChange(async (value) => {
						this.plugin.settings.mapProvider = value;
						await this.plugin.saveSettings();
						this.plugin.refreshAllViews();
					});
			});

		new Setting(containerEl)
			.setName("Open Apple Maps app when possible")
			.setDesc("On macOS and iOS, Apple Maps links use the maps:// URL scheme.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.useAppleMapsApp)
					.onChange(async (value) => {
						this.plugin.settings.useAppleMapsApp = value;
						await this.plugin.saveSettings();
						this.plugin.refreshAllViews();
					});
			});
	}
}

module.exports = class LocationWikilinksPlugin extends Plugin {
	async onload() {
		await this.loadSettings();

		this.addSettingTab(new LocationWikilinksSettingTab(this.app, this));
		this.registerMarkdownPostProcessor((el) => this.processRenderedLinks(el));
		this.registerEditorExtension(createEditorExtension(this));

		const clickHandler = (event) => this.handleLocationClick(event);
		document.addEventListener("click", clickHandler, true);
		document.addEventListener("auxclick", clickHandler, true);
		this.register(() => {
			document.removeEventListener("click", clickHandler, true);
			document.removeEventListener("auxclick", clickHandler, true);
		});

		this.app.workspace.onLayoutReady(() => this.processRenderedLinks(document.body));
	}

	processRenderedLinks(el) {
		for (const anchor of Array.from(el.querySelectorAll("a.internal-link, a.location-wikilink"))) {
			this.decorateAnchor(anchor);
		}
	}

	decorateAnchor(anchor) {
		const location = anchor.dataset.locationQuery || locationFromTarget(anchor.getAttribute("data-href")) || locationFromTarget(anchor.getAttribute("href"));
		if (!location) return;

		anchor.dataset.locationQuery = location;
		anchor.dataset.locationOriginalTarget = anchor.dataset.locationOriginalTarget || anchor.getAttribute("data-href") || anchor.getAttribute("href") || "";
		anchor.href = this.buildMapUrl(location);
		anchor.title = `Open "${location}" in ${this.getProviderName()}`;
		anchor.setAttribute("aria-label", anchor.title);
		anchor.removeAttribute("data-href");
		anchor.classList.remove("internal-link", "is-unresolved");
		anchor.classList.add("external-link", "location-wikilink");

		const text = anchor.textContent || "";
		if (text.trim().startsWith("*")) {
			anchor.textContent = text.trim().slice(1).trim();
		}
	}

	handleLocationClick(event) {
		if (event.type === "click" && event.button !== 0) return;
		if (event.type === "auxclick" && event.button !== 1) return;

		const target = event.target;
		if (!(target instanceof Element)) return;

		const anchor = target.closest("a.location-wikilink, a.internal-link");
		if (!anchor) return;

		const location = anchor.dataset.locationQuery || locationFromTarget(anchor.getAttribute("data-href")) || locationFromTarget(anchor.getAttribute("href"));
		if (!location) return;

		event.preventDefault();
		event.stopPropagation();
		if (typeof event.stopImmediatePropagation === "function") {
			event.stopImmediatePropagation();
		}

		this.openLocation(location);
	}

	buildMapUrl(location) {
		const query = encodeURIComponent(location);
		if (this.settings.mapProvider === "google") {
			return `https://www.google.com/maps/search/?api=1&query=${query}`;
		}

		if (this.settings.useAppleMapsApp && (Platform.isMacOS || Platform.isIosApp)) {
			return `maps://?q=${query}`;
		}

		return `https://maps.apple.com/?q=${query}`;
	}

	getProviderName() {
		return this.settings.mapProvider === "google" ? "Google Maps" : "Apple Maps";
	}

	async openLocation(location) {
		const url = this.buildMapUrl(location);

		try {
			if (typeof openExternal === "function") {
				await openExternal(url);
				return;
			}

			let electron = null;
			try {
				electron = typeof require === "function" ? require("electron") : null;
			} catch (_error) {
				electron = null;
			}

			if (electron && electron.shell && typeof electron.shell.openExternal === "function") {
				await electron.shell.openExternal(url);
				return;
			}

			window.open(url, "_blank", "noopener");
		} catch (error) {
			console.error("Failed to open location wikilink", error);
			new Notice(`Unable to open map link for "${location}".`);
		}
	}

	refreshAllViews() {
		this.processRenderedLinks(document.body);
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView && leaf.view.previewMode) {
				leaf.view.previewMode.rerender(true);
			}
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
};
