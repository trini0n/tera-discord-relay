﻿# tera-discord-relay

Chat relay between a Discord channel and TERA /guild chat.

![](http://i.imgur.com/4Wmr86w.png)

## Setup

You'll need:
- [Node.js](https://nodejs.org/)
- [Git](https://git-scm.com/)
- a Discord account (preferably a [bot account](https://discordapp.com/developers/docs/topics/oauth2#bots))
- a TERA account

### Discord

#### Bot Account

1. Create a [new Discord app](https://discordapp.com/developers/applications/me/create).
1. After app creation, click "Create a Bot User" on the application's setting screen. Make note of the bot ID and the token.
1. Invite the bot to your server by going to this link: <https://discordapp.com/api/oauth2/authorize?client_id={{BOT_ID}}&scope=bot&permissions=0> (but replace `{{BOT_ID}}` with your bot's ID).

#### User Account

**Note:** This *really* isn't recommended. Also, I'm going to assume you're already on the Discord you want to run the bot on.

1. Log into Discord with the user account.
1. Hit <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>I</kbd>.
1. Open the "Application" tab. You may need to click on the "»" to find it if the window is too small.
1. Open "Local Storage" and click on "https://discordapp.com". (This will be different for PTB and Canary.)
1. Look for "token" on the left side. Your token is the value on the right side.

### TERA

- Join the desired guild on the desired character to use as the bot relay.
- Turn off account armor.
- If you want the relay to be able to complete guild quests, give it a role and assign the appropriate permissions in game.

## Installation

Open up a terminal window and go to a place where you want to put the bot files. Then run:

```sh
git clone https://github.com/meishuu/tera-discord-relay.git
cd tera-discord-relay
npm install
```

## Configuration

You'll need to make two JSON configuration files: one for Discord and one for TERA. You can see an example for each in the `config/config-sample.json` of their respective directories. It is strongly recommended that you make a new file instead of changing the sample file.

Also note that in order for the rally notification to work for members in Discord, a `@rally` role must be created and assigned to those who want to receive the notification.

### Discord

- `socket-name` can be anything as long as it matches what you put in the TERA config.
- `token` is the token you got from the setup section above.
- `server-id` can be obtained by right-clicking on the Discord server and clicking on "Copy ID". If you don't see it, open Discord settings, head down to "Appearance", and tick on "Developer Mode".
- `channels`:
  - `gchat` channel ID can be obtained by right-clicking on the desired channel and clicking on "Copy ID".

### TERA

- `host` and `port` will come from your region's server list. You can get links to the server lists on the [`tera-proxy-sls` README](https://github.com/meishuu/tera-proxy-sls#server-urls).

Also, TERA has a few version numbers you might need to change for big patches. Open up [`tera/config/config.json`](tera/config/config-sample.json) and look for these:

- `patchVersion` is usually the major and minor patch number put together. For instance, if you launch TERA, go to server select, and see "56.03.02 EN2" at the bottom, try setting `patchVersion` to 5603. If that doesn't work, try 9901.
- `protocolVersion` is not so easy to check, but if you run [tera-proxy](https://github.com/meishuu/tera-proxy) it'll display the protocol version when you connect to it.

## Running

You'll need to start up two terminals.

One for Discord:

```sh
cd path/to/tera-discord-relay/discord
node . config/your-config-file.json
```

And one for TERA:
```sh
cd path/to/tera-discord-relay/tera
node . config/your-config-file.json
```

It's recommended to run these on an infinite loop because failure conditions terminate the program. However, do note that the auth server will start rejecting logins if too many are performed in a short span of time.

## Updating

To pull general updates for the Discord relay app:

```sh
cd path/to/tera-discord-relay
git pull
npm install
```

Every major version patch, TERA has some versioning info that needs changing. See the section above on TERA configuration for more info. To update tera-data, simply run:

```sh
npm install meishuu/tera-data
```

If the console is throwing up errors about certain packets not being defined, you may need to edit the (protocolVersion).map file and add them. The typical ones that you'll need are (NA mappings are included in the file [NA Additional Opcodes](https://github.com/trini0n/tera-discord-relay/blob/master/NA%20Additional%20Opcodes%20(330802))):
```
C_GUILD_APPLY_LIST
C_REQUEST_GUILD_INFO
C_REQUEST_FINISH_GUILD_QUES
C_DUNGEON_CLEAR_COUNT_LIST
S_DUNGEON_CLEAR_COUNT_LIST
S_PING
S_GUILD_INFO
S_GUILD_MEMBER_LIST
S_GUILD_QUEST_LIST
S_GUILD_APPLY_LIST
S_GUILD_APPLY_COUNT
S_SHOW_ITEM_TOOLTIP
S_UPDATE_GUILD_QUEST_STATUS
S_USER_PAPERDOLL_INFO
```

## MT-Directory

[MT-Directory](http://mt-directory.herokuapp.com) is a database created to track and log character's stats, gear, and dungeon clears. Requires [guild-app-inspector](https://github.com/trini0n/guild-app-inspector) and a proper config file that links to a MongoDB. More details soonTM.

Errors regarding `[proxy] failed to load guild-app-inspector` can be ignored if you're not using the module.
