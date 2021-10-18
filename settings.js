import { i18n } from "./monks-active-tiles.js"

export const registerSettings = function () {
	// Register any custom module settings here
	let modulename = "monks-active-tiles";

	game.settings.register(modulename, "prevent-cycle", {
		scope: "world",
		config: false,
		default: false,
		type: Boolean
	});
}