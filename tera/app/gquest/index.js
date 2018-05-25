module.exports = function Discord(dispatch) {
  let guildId;
  let timer;

  dispatch.hook('S_GUILD_INFO', (event) => {
    guildId = event.id;
  });

  dispatch.hook('S_GUILD_QUEST_LIST', (event) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    const quests = event.quests.filter(quest => quest.status === 2);
    quests.forEach((quest) => {
      dispatch.toServer('C_REQUEST_FINISH_GUILD_QUEST', { quest: quest.id });
    });
  });

  dispatch.hook('S_UPDATE_GUILD_QUEST_STATUS', (event) => {
    if (!timer && event.targets.every(t => t.total <= t.completed)) {
      timer = setTimeout(() => {
        dispatch.toServer('C_REQUEST_GUILD_INFO', { guildId, type: 6 });
        timer = null;
      }, 1000);
    }
  });
};