# Monk's Active Tile Triggers
Add-On Module for Foundry VTT
Want to teleport, or open doors, or hide characters, or display a message, or play a sound, or change a token's elevation when a token walks over a tile... now you can

## Installation
Simply use the install module screen within the FoundryVTT setup

## Usage & Current Features
When a Tile is drawn on the scene, another tab will be added, called triggers.

![monks-active-tiles](/screenshots/main.png)

You can set the triggering to be active or not.  If the tile is inactive, then nothing happens when a token walks over it.
Triggering of the tile can also be set to be triggered by everyone, or restricted to GM only tokens, or player only tokens.
The trigger can fire when a token enters to tile, or when they next leave the tile.
You can specify the chance that a tile will be triggered, so if the trap only has a 50% of working at any given time this is an option.

You can then add multiple actions for Foundry to take when a tile is triggered.
Current options allow you to: 
* Pause the Game, 
* Stop the Triggering token, 
* Teleport the token, 
* Show/Hide tokens or tiles.
* Activate/Deactivate a Tile or Light Source or Sound, 
* Alter a Wall, Token, or Tile (true and false will be converted to boolean, numbers will set the attribute to that value, and '+ 10' or '- 10' will increase or decrease the value),
* Play a Sound,
* Change a door state (this is a short form of alter),
* Show a notification,
* Add a chat message,
* Excute a Macro,
* Roll on a Roll Table.
* Add an effect to a Token
* Move a Token
* Reset the Fog of War

Monk's Tokenbar also adds the option to request a roll and to change the Token's movement state.

## Bug Reporting
I'm sure there are lots of issues with it.  It's very much a work in progress.
Please feel free to contact me on discord if you have any questions or concerns. ironmonk88#4075
I also have a Discord site called Monk's Discord Server that I use to keep people up to date with changes.

## Support

If you feel like being generous, stop by my <a href="https://www.patreon.com/ironmonk">patreon</a>.  

Or [![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/R6R7BH5MT)

Not necessary but definitely appreciated.

## License
This Foundry VTT module, writen by Ironmonk, is licensed under [GNU GPLv3.0](https://www.gnu.org/licenses/gpl-3.0.en.html), supplemented by [Commons Clause](https://commonsclause.com/).

This work is licensed under Foundry Virtual Tabletop <a href="https://foundryvtt.com/article/license/">EULA - Limited License Agreement for module development from May 29, 2020.</a>
