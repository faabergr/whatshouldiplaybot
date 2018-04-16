const bgg = require("bgg")();
const winston = require("winston");
const Twit = require("twit");

const T = new Twit(require("./config.js"));

const minutesPattern = /(\d+)?(min|m|minutes|mins)$/;
const hoursPattern = /(\d+)(hr|h|hours|hrs|hr)$/;
const playersPattern = /(\d+)(p|players|people|peeps|player)$/;

const fiveMinutesInMilliseconds = 5 * 60 * 1000;

winston.add(winston.transports.File, { name: "trace", filename: "trace.log" });
winston.add(winston.transports.File, {
  name: "errors",
  filename: "errors.log",
  level: "error"
});

const collectionCache = new Map();
const itemCache = new Map();

if (process.argv.length > 2) {
  thing({
    user: {
      screen_name: "faabergr"
    },
    text: "45minutes 3p ludothedog"
  });
}

async function thing(tweet) {
  let params = extractParameters(tweet.text);
  let requestId = guid();
  info(
    `extracted game time of ${params.gameTime} minutes and player count of ${
      params.playerCount
    } and username ${
      params.bggUsername
    } and too many players: ${params.tooManyPlayerCounts ===
      true} and too many times: ${params.tooManyTimes === true}`,
    requestId
  );

  var message = await getRecommendation(params, requestId);
  info(message, requestId);
}

var stream = T.stream("statuses/filter", { track: ["@wsipbot"] });
stream.on("tweet", tweetEvent);

async function tweetEvent(tweet) {
  let requestId = guid();
  info(`tweet from ${tweet.user.screen_name}`, requestId);
  let params = extractParameters(tweet.text);
  info(
    `extracted game time of ${params.gameTime} minutes and player count of ${
      params.playerCount
    } and username ${
      params.bggUsername
    } and too many players: ${params.tooManyPlayerCounts ===
      true} and too many times: ${params.tooManyTimes === true}`,
    requestId
  );
  var name = tweet.user.screen_name;
  var nameId = tweet.id_str;

  let message;
  const instructions =
    ' Please tweet in this format: "<playercount> <maxtime> <bggusername>" (e.g., "2players 60min MyBggUsername" or "4p 2hrs CoolPerson21" without the quotes)';
  if (params.tooManyPlayerCounts) {
    message = "Too many player counts provided." + instructions;
  } else if (params.tooManyTimes) {
    message = "Too many available times provided." + instructions;
  } else if (params.tooManyBggUsernames) {
    message = "Too many BGG usernames provided." + instructions;
  } else if (params.tooFewBggUsernames) {
    message = "Please provide your BGG username." + instructions;
  } else if (params.playerCount === 0) {
    message = "Player count was not given!" + instructions;
  } else if (params.gameTime === 0) {
    message = "No game time was given!" + instructions;
  } else {
    message = await getRecommendation(params, requestId);
  }
  var reply = `@${name} ${message}`;
  var tweetParams = {
    status: reply,
    in_reply_to_status: nameId,
    in_reply_to_status_id: tweet.id_str
  };
  T.post("statuses/update", tweetParams, (err, data, response) => {
    if (err !== undefined) {
      winston.error(err);
    } else {
      info(`Tweeted: ${data.text}`, requestId);
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

function getGameTime(timeTerm, requestId) {
  let timeInMinutes;
  if (termIsHours(timeTerm)) {
    let hourMatch = timeTerm.match(hoursPattern);
    info(`found hours ${hourMatch[1]}`, requestId);
    timeInMinutes = hourMatch[1] * 60;
  } else {
    let minuteMatch = timeTerm.match(minutesPattern);
    info(`found minutes ${minuteMatch[1]}`, requestId);
    timeInMinutes = minuteMatch[1];
  }
  return timeInMinutes;
}

function termIsPlayerCount(term) {
  return term.match(playersPattern) !== null;
}

function getPlayerCount(countTerm, requestId) {
  let playerCountMatch = countTerm.match(playersPattern);
  info(`Found count of ${playerCountMatch[1]}`, requestId);
  return playerCountMatch[1];
}

function extractParameters(tweet, requestId) {
  let params = {};
  let splitTweet = tweet.split(/\s+/).filter(term => !term.startsWith("@"));
  let times = splitTweet.filter(
    word => termIsMinutes(word) || termIsHours(word)
  );

  if (times.length > 1) return { tooManyTimes: true };
  params.gameTime =
    (times.length == 1 && getGameTime(times[0], requestId)) || 0;

  let playerCounts = splitTweet.filter(termIsPlayerCount);
  if (playerCounts.length > 1) return { tooManyPlayerCounts: true };
  params.playerCount =
    (playerCounts.length == 1 && getPlayerCount(playerCounts[0], requestId)) ||
    0;

  let unclassifiedTerms = splitTweet.filter(
    term =>
      !termIsMinutes(term) && !termIsHours(term) && !termIsPlayerCount(term)
  );
  if (unclassifiedTerms.length > 1) return { tooManyBggUsernames: true };
  if (unclassifiedTerms.length === 0) return { tooFewBggUsernames: true };

  params.bggUsername = unclassifiedTerms[0];
  return params;
}

function generateMessage(item, bggUsername) {
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

  let name;
  if (Array.isArray(item.name)) {
    name = item.name.filter(n => n.type === "primary")[0].value;
  } else {
    name = item.name.value;
  }

  return `${bggUsername}, ${preamble} ${name}. ${playerCounts} ${timeRange} to play. Check out https://boardgamegeek.com/boardgame/${
    item.id
  }/ for more info.`;
}

async function getRecommendation(params, requestId) {
  let { bggUsername, playerCount, gameTime } = params;
  info(`getting recommendations for ${bggUsername}`, requestId);

  let results = await getCollection(bggUsername);
  if (!results || results.length === 0) {
    info(`Could not find any results for ${bggUsername}`, requestId);
    return Promise.resolve(
      `Sorry, I couldn't find a BGG collection for ${bggUsername}. Please check your spelling and try again.`
    );
  }
  info(`found ${results.length} items`, requestId);
  const ownedBoardgames = results.filter(
    r => r.subtype === "boardgame" && r.status.own === 1
  );
  info(`of those, ${ownedBoardgames.length} are owned`, requestId);

  let gameIndex = getRandomInt(0, ownedBoardgames.length);
  let item = ownedBoardgames[gameIndex];

  let tries = 3;
  let game = null;

  while (tries-- > 0 && game === null) {
    game = await attemptToRetrieveGame(item.objectid, playerCount, requestId);
  }

  if (game !== null) {
    return Promise.resolve(generateMessage(game, bggUsername));
  } else {
    info("Could not find matching game", requestId);
    return Promise.resolve(
      `Sorry ${bggUsername}, I could not find a matching game in the first 10 games I looked at`
    );
  }
}

async function attemptToRetrieveGame(gameObjectId, playerCount, requestId) {
  let game = await getGame(gameObjectId, requestId);
  info(`retrieved game from objectId ${gameObjectId}: ${JSON.stringify(game)}`);
  if (
    game &&
    game.maxplayers &&
    game.maxplayers.value &&
    game.maxplayers.value >= playerCount &&
    game.minplayers &&
    game.minplayers.value &&
    playerCount >= game.minplayers.value
  ) {
    return Promise.resolve(game);
  } else {
    return Promise.resolve(null);
  }
}

function chooseOne(choices) {
  return choices[getRandomInt(0, choices.length)];
}

async function getCollection(username, requestId) {
  var collection = collectionCache.get(username);
  if (
    !collection ||
    collection.expiration + fiveMinutesInMilliseconds <= Date.now()
  ) {
    let results = await bgg("collection", {
      username: username,
      excludesubtype: "boardgameexpansion"
    });
    if (results.items && results.items.item) {
      info(
        `Setting cache for ${username} with ${
          results.items.item.length
        } size collection`,
        requestId
      );
      collectionCache.set(username, {
        expiration: Date.now(),
        results: results.items.item
      });
      return Promise.resolve(results.items.item);
    } else if (results.errors.error) {
      winston.error(`Could not find username ${username}`, {
        requestId: requestId
      });
    }
    info(`Could not find any results for ${username}`);
    return Promise.resolve(null);
  } else {
    info(
      `Found cache entry for ${username} with ${
        collection.length
      } size collection`,
      requestId
    );
    return Promise.resolve(collection);
  }
}

async function getGame(id, requestId) {
  let item = itemCache.get(id);
  if (!item || item.expiration + fiveMinutesInMilliseconds <= Date.now()) {
    info(
      `Cache miss on game ${id}, retrieving from bgg (item was expired: ${(item &&
        item.expiration + fiveMinutesInMilliseconds <= Date.now()) ||
        false})`,
      requestId
    );
    let results = await bgg("thing", { id: id });
    if (results.items.item) {
      info(`Retrieved info on game ${id} from bgg, setting cache`, requestId);
      itemCache.set(id, {
        expiration: Date.now(),
        results: results.items.item
      });
      return Promise.resolve(results.items.item);
    } else {
      return Promise.reject();
    }
  } else {
    return Promise.resolve(item);
  }
}

function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min; //The maximum is exclusive and the minimum is inclusive
}

function info(message, requestId) {
  winston.info(message, { requestId: requestId });
}

function guid() {
  return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
}

function s4() {
  return Math.floor((1 + Math.random()) * 0x10000)
    .toString(16)
    .substring(1);
}
