## Version 1.0.27

Added option for triggering with a minimum number of tokens.  So if you want the entire party to walk across a Tile before it triggers you can now do that.

Per Token has now changed to keeping a history of all the triggereing events that have happened to the Tile.  That way I can, in the future, improve upon what conditions trigger the Tile.

In line with changing from Per Token information to keeping a history, I've change the interface to using hasTriggered(tokenid, method, userid), countTriggered(), addHistory(tokenid, method, userid), removeHistory(id), and getHistory(tokenid)

Added the Hurt/Heal action to make it easier to alter HP while still respecting temporary hitpoints

Added the Reset Trigger History action, so you can reset the triggering history of a Tile.

Updated the stop sound action so that it can stop playing all ambient sounds and not just the Tile sounds.

Removed libRuler patching, since the module has now been patched with updates.  Thank you very much caewok!

## Version 1.0.26

Allow sound files to use wildcard when selecting.  So the Play Sound action can be randomized.

Added entity and current values to the Alter action.  Entity could be different than the triggering token, and current value will let you alter something based on the returned results of a previous action.

Added looping the the play sound action

Added Stop sound action, so you can now stop the looping sound of a Tile.

Added current values to the notification handlebars context, so you can use returned results in notifications.

Added the same to the chat message, and also added the current entity which might differ from the triggering token.

Fixed issue with polyglot language not being set.

Added option to only animate a Tile for the triggering player, instead of for everyone.

Fixed issue with setting permissions.  And prevented the canvas from panning to a random token.

Fixed issue where once per token was not being set by the On Click action.

Fixed issue where actions that were delayed by some time weren't firing.

Added API to support macros adding, checking, and reseting the once per token data.

Added elevation action, which is pretty much just a shorthand for alter.

## Version 1.0.25

Changes the way the trigger functions are called.  This isn't really visible to the players/GM but should make it easier behind the scenes to pass variables.

Added option to Pan Canvas to choose who the canvas pans for.

Fixed an issue with Canvas pan that was preventing the panning from being animated.

Added option of "From Previous" for Create Token, and Add Item actions.  What this will allow, is if a Roll Table is immediately above the Create or Add Item action, it will take the values from the Roll Table and use them.  So you can automatically create a monster from a rolltable, or automatically add an item from a Roll Table.

Activate can now be passed multiple entities.

On Click will now use the currently controlled Tokens.

Macros will get passed all the results from previous actions in the values property.  Accessed via arguments[0].values.

Added option to set the volume ofa Play Sound action.  If you want to set it to a specific volume, use a floating point number for percentage.  If you want to set ti as a percentage of the Core Ambient volume, use actual percent.  So 0.5 will set it to 50% volume.  And 50% will set it to 50% of the Foundry Ambient volume.

Updated the Chat Message so that it will use the correct TOken.  And can even be used to specify what Token does the Chat Message.  Along with allowing in character chat bubbles.

Fixing the Chat Message resulting from a Roll Table roll.  Before it was always from the GM, now if a Player activates it, it will show as coming from the player.

Updated the permissions action so that setting the permissions for everyone will set the default permission.

Repositioned the set target code in the attack action so that target are added before the attack happens.

## Version 1.0.24

Add option for teleport to delete the source Token instead of just making it invisible.

Allow both Tiles and Drawing to be moved.

Allow Drawings to be shown/hidden.

Update the attack action for PF2 and PF1

Add option to roll the attack instead of just displaying the chat card of the attack.

Added an action, You can now change the scene for a player.

Added another action, Add to combat, so you can add tokens to a combat.

BREAKING CHANGE, Updated the macro execution, thank you tposney, so that it should handle arguments the same way that Trigger Happy does.

Removed some debug information that was constantly being added.

## Version 1.0.23

Added a new action, trigger another Tile.  So now one Tile can trigger a different one

Added spells to the Attack action.

Added roll mode option tot he Attack action.

## Version 1.0.22

Fixed issue with the action config if there aren't any actors added to the world yet.

Added info if there's no token to teleport when a teleport action is triggered.

Allow Move Token action to move to a Tile and not just a location.

Removed the try catch blocks from individual actions and put it up one level, so that if any actions have an error it can be reported.

Creating a token can now use a Tile instead of just a location as a destination for the Token.

Added Attack action.  You'll need to set up an actor with the attack you wish to use but this can be used to calculate the damage of a trap.

Changed how macros are executed.  Before I was passing it back to the player to run the full macro, changed the code so the player runs a previously calculated version.  Means I don't have to recalculate arguments and hopefully I've fixed a bug where the macro won't run.

Fixed up issues with stopping the Token from moving.  Make it integrate with libRuler a little better and not require as many saves to the database.

Added cool down period for movement so if the player spams the movement key, and the Tile requests a stop, that it will briefly halt the movement of that Token even if more movement keys are pressed.

Added option to restrict a sound to a scene.  So only the players viewing the scene will hear it, GM's will still hear the sound though so they know what's happening.

## Version 1.0.21

Added typeahead to the Alter action Attribute field to make it a bit easier to know what goes there.

Fixed an issue with Handle bar support if the Tile is manually Clicked and there's no Token to add to the context properly.

Fixed issue when creating a chat message with no Token present.  It didn't know who to whisper to.

Added Permissions action. So you can now change the permissions of an entity when a Tile is triggered.

Fixed an issue with On Click and who's allowed to control the triggering.  It will now only trigger for the role that's been selected.

possibly BREAKING CHANGE, I had mis-labelled the variable name for who gets to control the trigger.  It's fixed now, but if you had a Tile that you set Controlled By, you'll need to change it back.  On the plus side, it should respect that now, whereas it wasn't working at all for previous versions.

Fixed an issue with a player manually triggering a Tile.

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




