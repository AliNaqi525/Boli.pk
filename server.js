const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");
const { createClient } = require("redis");
const EventEmitter = require("events");

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// In-memory fallback if Redis is not available
const localPubSub = new EventEmitter();
global.localPubSub = localPubSub;

// Shared active bid cache in memory as fallback
const memoryCache = new Map();
global.memoryCache = memoryCache;

let redisClient = null;
let redisSubscriber = null;
let redisAvailable = false;

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

async function initRedis(io) {
  try {
    redisClient = createClient({ url: redisUrl });
    redisSubscriber = redisClient.duplicate();

    redisClient.on("error", (err) => {
      console.warn("⚠️ Redis Client Error. Using in-memory fallback.", err.message);
      redisAvailable = false;
    });

    redisSubscriber.on("error", (err) => {
      console.warn("⚠️ Redis Subscriber Error. Using in-memory fallback.", err.message);
      redisAvailable = false;
    });

    await redisClient.connect();
    await redisSubscriber.connect();
    
    redisAvailable = true;
    console.log("🔌 Connected to Redis at", redisUrl);

    // Subscribe to Redis bids channel
    await redisSubscriber.subscribe("auction_bids", (message) => {
      try {
        const bidData = JSON.parse(message);
        const { itemId } = bidData;
        console.log(`📡 Redis Pub/Sub: Broadcasting bid update for item ${itemId}`);
        io.to(`room:${itemId}`).emit("bidUpdated", bidData);
      } catch (err) {
        console.error("Failed to parse Redis message:", err);
      }
    });

  } catch (err) {
    console.warn("⚠️ Redis connection failed. Operating in in-memory fallback mode.", err.message);
    redisAvailable = false;
  }
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Attach local in-memory pub-sub listener
  localPubSub.on("bidPlaced", (bidData) => {
    if (!redisAvailable) {
      const { itemId } = bidData;
      console.log(`📡 Local Pub/Sub Fallback: Broadcasting bid update for item ${itemId}`);
      io.to(`room:${itemId}`).emit("bidUpdated", bidData);
    }
  });

  // Share redisAvailable flag globally so API routes can inspect it
  global.redisAvailable = () => redisAvailable;
  global.getRedisClient = () => (redisAvailable ? redisClient : null);

  // Socket.io connection logic
  io.on("connection", (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    socket.on("joinRoom", (itemId) => {
      socket.join(`room:${itemId}`);
      console.log(`👥 Client ${socket.id} joined room for item: ${itemId}`);
    });

    socket.on("leaveRoom", (itemId) => {
      socket.leave(`room:${itemId}`);
      console.log(`👥 Client ${socket.id} left room for item: ${itemId}`);
    });

    socket.on("disconnect", () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
    });
  });

  // Initialize Redis
  initRedis(io);

  httpServer.listen(port, () => {
    console.log(`🚀 Boli.pk custom server ready on http://${hostname}:${port}`);
  });
});
