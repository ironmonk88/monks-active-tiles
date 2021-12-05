import { i18n } from "./monks-active-tiles.js"

export const registerSettings = function () {
	// Register any custom module settings here
	let modulename = "monks-active-tiles";

	game.settings.register(modulename, "use-core-macro", {
		name: i18n("MonksActiveTiles.use-core-macro.name"),
		hint: i18n("MonksActiveTiles.use-core-macro.hint"),
		scope: "world",
		config: true,
		default: false,
		type: Boolean,
	});

	game.settings.register(modulename, "allow-player", {
		name: i18n("MonksActiveTiles.allow-player.name"),
		hint: i18n("MonksActiveTiles.allow-player.hint"),
		scope: "world",
		config: true,
		default: false,
		type: Boolean,
	});

	game.settings.register(modulename, "prevent-cycle", {
		scope: "world",
		config: false,
		default: false,
		type: Boolean
	});
}