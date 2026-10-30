# Location Wikilinks

Turns [[*location]] wikilinks into Apple Maps or Google Maps links.

## Use

Write a location as `[[*Golden Gate Park]]` or use an alias such as `[[*Golden Gate Park|the park]]`. Click the link in Editing or Reading view to open it in the selected map provider. Choose Apple Maps or Google Maps under **Settings → Location Wikilinks**. On supported Apple devices, the Apple Maps app option opens `maps://` links.

## Network use

Clicking a location link opens Apple Maps (`maps.apple.com` or the `maps://` app scheme) or Google Maps (`www.google.com/maps`) in your browser or maps app. The location text from the wikilink is sent as the map search query. The plugin does not contact those services in the background.

## Install manually

Copy `manifest.json`, `main.js`, and `styles.css` (if present) into `<vault>/.obsidian/plugins/location-wikilinks/`, then enable the plugin in Obsidian.

## Source

This plugin is written in JavaScript. `main.js` is the source.

## License

MIT. See [LICENSE](LICENSE).
