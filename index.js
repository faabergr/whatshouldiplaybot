const bgg = require("bgg")();

getRecommendation(process.argv[2]);

function getRecommendation(bggUsername) {
  console.log(`getting recommendations for ${bggUsername}`);

  bgg("collection", {
    username: bggUsername,
    excludesubtype: "boardgameexpansion"
  }).then(results => {
    if (!results.items.item) {
      console.log(results.item.item);
    }
    console.log(`found ${results.items.item.length} items`);
    const ownedBoardgames = results.items.item.filter(
      item => item.subtype === "boardgame" && item.status.own === 1
    );
    console.log(`of those, ${ownedBoardgames.length} are owned`);

    var gameIndex = getRandomInt(0, ownedBoardgames.length);
    var pickedGame = ownedBoardgames[gameIndex];

    bgg("thing", { id: pickedGame.objectid }).then(results => {
      const item = results.items.item;
      const playerCounts =
        item.minplayers.value === item.maxplayers.value
          ? `For ${item.minplayers.value} players,`
          : `For ${item.minplayers.value}-${item.maxplayers.value} players,`;

      const timeRange =
        item.minplaytime.value === item.maxplaytime.value
          ? `it takes approximately ${item.minplaytime.value} minutes`
          : `it takes between ${item.minplaytime.value} and ${
              item.maxplaytime.value
            } minutes`;

      const preamble = chooseOne([
        "you should play",
        "why don't you try",
        "I think you should play"
      ]);

      console.log(
        `${bggUsername}, ${preamble} ${
          pickedGame.name.$t
        }. ${playerCounts} ${timeRange} to play.`
      );
    });
  });
}

function chooseOne(choices) {
  return choices[getRandomInt(0, choices.length)];
}

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min; //The maximum is exclusive and the minimum is inclusive
}
