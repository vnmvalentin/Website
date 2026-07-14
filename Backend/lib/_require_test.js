
const createAwardsRouter = require("./awardsRoutes");
const createClipqueueRouter = require("./clipqueueRoutes");
const createGiveawayRouter = require("./giveawayRoutes");
const createBingoRouter = require("./bingoRoutes");
const createPackRouter = require("./packRoutes");
const createWinchallengeRouter = require("./winchallengeRoutes");
const createPollRouter = require("./pollRoutes");

console.log("exports types:", {
  awards: typeof createAwardsRouter,
  clipqueue: typeof createClipqueueRouter,
  giveaway: typeof createGiveawayRouter,
  bingo: typeof createBingoRouter,
  pack: typeof createPackRouter,
  winchallenge: typeof createWinchallengeRouter,
  poll: typeof createPollRouter,
});
