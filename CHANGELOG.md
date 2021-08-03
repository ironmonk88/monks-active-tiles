## Version 1.0.20

Removing debug information

Fixing small issue when a player tries to trigger a Tile.

## Version 1.0.19

Fixed issue when changing action, it would retain information for the previous action, and some of that data was incompatible with the next action.

Fixed issue where updating the action, wasn't using localization for the name.

Fixed issue where the delayed seconds weren't showing up on the action list.

Added the much asked for "On Click" trigger, so if you're on the token layer and the tile is set to On Click, it will trigger when clicked.

Updated the Action Config screen to use decimal seconds

Fixed issue where the display for 'pan canvas' was displaying snap information rather than location information.

Teleport will now let you avoid other tokens at the destination.  It will do its best to find the closest available spot to the destination, but it can get a little weird if transporting to a different scene.

Teleport should center your screen so the token is still under your mouse... but when switching to a different scene I can't figure out how to calculate it properly.

Increased the fade time when switching to a new scene so that it has time to load the scene in the background.

Fixed an issue where a teleported token was no longer the token being referenced in further actions because it was essentially a new token.  Updated the code so it will reference the new token from that point on.

Creating a token action will now also use a Tile for a drop location.  And you can set the token to be created as invisible.

Alter will now accept dice rolls using the [[1d4]] notation, and can be rolled to a chat message, and have the roll mode set properly.

Fixed an error in the code with Alter action and parcing it as a float properly.

Updated the Play Sound action to allow for sound to be played for everyone, gm only, and triggering token.

Fixed an issue with Play Sound so that it will respect who it's supposed to play for.

Fixed an issue with Play Sound that the label wasn't using localization.

Added toggle option to the Change Door State.  If the door is locked it will not toggle, but if open or closed it will toggle between the two.

Added the option to notification to set who it should be shown to.

Fixed an issue with notification so that handle bar replacements are done properly.

Fixed an issue with notification so that the label is created properly.

Fixed an issue with Chat Message so that it gets the speaker properly.

Fixed an issue with Chat Message so that handle bar replacements are done properly.

Added option for flavor text to the Chat Message.

Added option for roll mode to Roll Table.

Fixed issue that prevented Reset Fog action from working.

Fixed issue of who the journal is displayed to.  Previously it was just showing to the GM, now you can have it show to everyone, players, or the triggering token.

Added the "Add Item" action.  So when the Tile is triggered it will add the specific item to the token's inventory.

Fixed issue with teleporting preloading a scene.

BREAKING CHANGES!!!

I've updated how I pass tiles and tokens to functions, this will break Monk's TokenBar.  It's fixed, but TokenBar will need to be released and updated for it to work.

## Version 1.0.18

Added option to choose all Tokens currently within the Tile, to go along with "Current Tile", "Triggering Token", and "Player Tokens"

Added option to teleport to a Tile instead of an x/y location.  This way you can move to destination of the teleport easier.

Added additional trigger modes, On Movement, On Enter/Exit, and On Click.  Movement will trigger if the Token moves at all within the Tile (this includes entering and exiting the Tile).  On Enter/Exit will fire on both entering and exiting (be aware this can cause the Tile to trigger twice if the Token moves across it).  And On Click makes it so the Tile will not trigger at all unless you manually click it.

Added option to trigger based on who is controlling the token.  Currently it's restricted to the type of token, but if a GM moves a player token, you might not want the Tile to trigger.  The text has been changed to make it a little clearer what's meant by each setting.

Removed the option to add an animation when teleporting.  It was a bit silly and can be replaced using actual animations via a macro.

Teleport will flash an overlay over the screen when teleporting begins to make the transition a little less jarring, and will pan the canvas so that the token is in approximately the same spot it was relative to the screen.  The overlay and canvas pan only affect the player.

The GM will now receive a notification if a token has teleported to a different scene.

If the teleport is to a different scene it will detect a scene shift and begin preloading it.

Alter will now check the actor of a token to see if it can apply the changes there if it can't find the attribute on the token itself.  If the property being referenced is an object it will try and use the .value property.  The value part now supports handlebar substitutions.

Notification, and Chat Message now support handlebar substitutions.  actor, tile, token, and user can be used for related property names.

Active Effects should now be supported on PF2E

Fixed issues with playing an animated Tile wasn't being shown to players.

Executing a macro has hopefully gone through it's last change in awhile, sorry for changing the arguments around all the time.  I think I've settled on the proper order now.  Unfortunately due to the way Active Tiles is called I need to include the token, tile, and actor information within the arguments.  So the actual arguments passed from Active Tiles will be included in an args property.  This is a little weird as you now have to reference it using args[0].args[0] for the first property.  The data added to the args field will be split on spaces, but strings can be quote delimited.  And it will also support handlebar substitution.

Overridden functions are now using libWrapper

## Version 1.0.17

Adding action, Open journal

Fixing macros so they'll run as the correct user.

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




