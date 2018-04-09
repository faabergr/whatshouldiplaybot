const bgg = require("bgg")();
const winston = require("winston");
const Twit = require("twit");

const T = new Twit(require("./config.js"));

const minutesPattern = /(\d+)?(min|m|minutes|mins)$/;
const hoursPattern = /(\d+)(hr|h|hours|hrs|hr)$/;

winston.add(winston.transports.File, { name: "trace", filename: "trace.log" });
winston.add(winston.transports.File, {
  name: "errors",
  filename: "errors.log",
  level: "error"
});

const collectionCache = new Map();

if (process.argv.length > 2) {
  let params = extractParameters(process.argv[2]);
  winston.info(
    `extracted game time of ${params.gameTime} minutes and player count of ${
      params.playerCount
    }`
  );
}

var stream = T.stream("statuses/filter", { track: ["@wsipbot"] });
stream.on("tweet", tweetEvent);

function tweetEvent(tweet) {
  winston.info(`tweet from ${tweet.user.screen_name}`);
  let params = extractParameters(tweet);
  winston.info(
    `extracted game time of ${params.gameTime} minutes and player count of ${
      params.playerCount
    }`
  );

  var name = tweet.user.screen_name;
  var nameId = tweet.id_str;

  var reply = `hello @${name}! You are the best!`;
  var params = { status: reply, in_reply_to_status: nameId };
  T.post("statuses/update", params, (err, data, response) => {
    if (err !== undefined) {
      winston.error(err);
    } else {
      winston.info(`Tweeted: ${params.status}`);
    }
  });
}

// times: 60min 60mins 1hr 1hour 60minutes 60m 1h 2h
// players 2players 5p 2pla
// coop co-op

function termIsMinutes(term) {
  return term.match(minutesPattern) !== null;
}

function termIsHours(term) {
  return term.match(hoursPattern) !== null;
}

function getGameTime(time) {
  let timeInMinutes;
  if (termIsHours(time)) {
    let hourMatch = time.match(hoursPattern);
    winston.info(`found hours ${hourMatch[1]}`);
    timeInMinutes = hourMatch[1] * 60;
  } else {
    let minuteMatch = time.match(minutesPattern);
    winston.info(`found minutes ${minuteMatch[1]}`);
    timeInMinutes = minuteMatch[1];
  }
  return timeInMinutes;
}

function extractParameters(tweet) {
  let params = {};
  let splitTweet = tweet.split(" ");
  let times = splitTweet.filter(
    word => termIsMinutes(word) || termIsHours(word)
  );

  if (times.length > 1) return { tooManyTimes: true };
  params.gameTime = (times.length == 1 && getGameTime(times[0])) || 0;

  let playerCounts = splitTweet.filter(
    word => word.endsWith("p") || word.endsWith("players")
  );
  if (playerCounts.length > 1) return { tooManyPlayerCounts: true };
  //params.playerCount = getPlayerCount(playerCounts[0]);

  return params;
}

//getRecommendation(process.argv[2]);

function getRecommendation(bggUsername) {
  winston.info(`getting recommendations for ${bggUsername}`);

  getCollection(bggUsername)
    .then(results => {
      if (!results.items || !results.items.item) {
        winston.info(`Could not find any results for ${bggUsername}`);
        return;
      }
      winston.info(`found ${results.items.item.length} items`);
      const ownedBoardgames = results.items.item.filter(
        item => item.subtype === "boardgame" && item.status.own === 1
      );
      winston.info(`of those, ${ownedBoardgames.length} are owned`);

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

        winston.info(
          `${bggUsername}, ${preamble} ${
            pickedGame.name.$t
          }. ${playerCounts} ${timeRange} to play.`
        );
      });
    })
    .catch(result => {
      winston.error(
        `Could not connect to BGG API at ${result.url}: ${
          result.raw.response.statusCode
        } ${result.raw.response.statusMessage}`
      );
    });
}

function chooseOne(choices) {
  return choices[getRandomInt(0, choices.length)];
}

function getCollection(username) {
  var collection = collectionCache.get(username);
  if (!collection) {
    return bgg("collection", {
      username: username,
      excludesubtype: "boardgameexpansion"
    }).then(results => {
      winston.info(
        `Setting cache for ${username} with ${
          results.items.item.length
        } size collection`
      );
      collectionCache.set(username, results);
      return results;
    });
  } else {
    winston.info(
      `Found cache entry for ${username} with ${
        results.items.item.length
      } size collection`
    );
    return Promise.resolve(collection);
  }
}

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min; //The maximum is exclusive and the minimum is inclusive
}
