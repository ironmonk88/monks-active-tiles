## Version 1.0.16

Fixing minor issue with determining what entity the action is being applied to.

Adding another action, you can start or stop an animation on a Tile.

## Version 1.0.15

Fixing support for Levels

## Version 1.0.14

Sorted the list of actions that could be taken.

Cleaned up the display for setting up actions.

Added option for action controls to have a default value

Added movement action, so you can move a token along a path.  Add multiple moves for the same token and set the first ones to wait, and you can add a complex path.

Added the create token action, so you can create a Token on the scene when a tile is triggered.

Added active effect action, so you can add an effect to a token.

Added support for Levels, to make sure the Tile is on the same level as the triggering token.

## Version 1.0.12

Fixed issue with displaying the delay by text box

Added ability to reorder actions

Added option to stop with the remining actions if the function called returns false.  Helpful for macros and requsting a roll.

Added ability to trigger the tile manually.

Added Reset Fog of War action.

Switched from overriding the Tile HUD to just adding the controls to the Tile HUD.  This should make it easier to maintain in case Foundry changes the Tile HUD.

## Version 1.0.11

Fixed issue when adding actions to a new Tile.

Fixed issue with localization when appending actions.

Fixed issue with Delete Action icon

Fixed issue when teleporting tokens not saving position.

## Version 1.0.10

Fixed issue with multiple walls being changed at the same time.

Fixed issue with secret doors not being updated.

Fixed display name so that it includes the wall id

adding advanced macro execution.

Added polyglot support with chat messages

Changed how actions are saved.  BE AWARE that instead of svaing when you update the action, the action won't save unless you save the Tile.

## Version 1.0.9

Added support to activate/deactivate lights and sounds

## Version 1.0.8

Fixed issue with tokens sneaking into the tile by stopping right on the edge of the tile.

Fixed conflict with Window Control module.  The module didn't support maximizing multiple windows all at the same time.

Fixed issue with data not saving to the database when multiple triggers fire at once.

Fixed issue when selecting an entity, it was displaying as if it were a location.

Added option to animate the canvas pan on teleport

## Version 1.0.7

Fixed libWrapper support

Updated the code that checks on cancelling the remaining animation.

## Version 1.0.6

Added libWrapper support

Overrode Ruler moveToken so that I can easily cancel pending movements.

## Version 1.0.5

Added localization text

Fixing issues with the standard ruler.

Trying to fix issues with cancelling the rest of a multi-part path.

## Version 1.0.4

Getting close to releasing!! Yayy!!

Added changes to support players firing a trigger.

Restricted which actions can be delayed

Added more localization updates

Started adding localization

Prevented the scene from changing if a player has triggered a teleport, working on code to send the scene change back down to the player.




