const { createClient } =  require('redis');
const BeeQueue = require('bee-queue');

const {
  safeNumber,
  log,
  delay,
  logJob,
} = require('./utils');

const redisEvents = [ 'connect', 'end', 'error', 'ready', 'reconnecting', 'warning' ];

// Note: The 'ready' callback from Redis triggers the Beequeue setup
const makeRedisCallback = ({redisClient, event, side}) => value => {
  log(`redisClient ${side}: '${event}': ${JSON.stringify(value)}`);

  if (event === 'ready') {
    redisClient.dbsize((err, size) => log(`redisClient ${side}: dbsize: ${err ? err : size}`))

    const queueConfig = {
      side,
      verbose: 0,

      randomDelay: safeNumber(process.env.BEEQUEUE_RANDOM_DELAY, 0),

      // Client
      // Number of jobs to (try to) keep active
      numChains: safeNumber(process.env.BEEQUEUE_NUMCHAINS, 1),
      // Number of 'succeeded' events between logging of stats
      interval: safeNumber(process.env.BEEQUEUE_INTERVAL, 200),
      clientName: process.env.BEEQUEUE_CLIENT,

      // Server/worker
      concurrency: safeNumber(process.env.BEEQUEUE_CONCURRENCY, 1),
    };

    // Start the interesting stuff
    startBeequeue(redisClient, queueConfig);
  }
};

const startBeequeue = async (redisClient, queueConfig) => {
  const { side, verbose, concurrency, numChains, interval, randomDelay } = queueConfig;
  log(`startBeequeue: ${JSON.stringify(queueConfig)}`);

  const beequeueName = 'CCD';
  const isWorker = side === 'server';
  const isClient = !isWorker;

  const beequeueOptions = {
    redis: redisClient,
    prefix: 'ccd',
    isWorker,
    activateDelayedJobs: isWorker,
    //removeOnFailure: true,
    //removeOnSuccess: true,
    getEvents: isClient,
  };

  const queue = new BeeQueue(beequeueName, beequeueOptions);

  // Log these Queue events regardless of side because they are rare in this use case
  queue.on('ready', () => log(`QUEUE ${beequeueName} 'ready'`));
  queue.on('error', err => log(`QUEUE ${beequeueName} 'error': A queue error happened: ${err.message}`));
  // Unrelated bug: the retrying event doesn't happen, even though the job is retried and the job gets the 'retrying' event
  // See: https://github.com/bee-queue/bee-queue/issues/184
  queue.on('retrying', (job, err) => log(`QUEUE ${beequeueName} 'retrying': Job ${job.id} failed with error '${err.message}' and retries ${job.options.retries}`));
  queue.on('stalled', jobId => log(`QUEUE ${beequeueName} 'stalled': Job ${jobId} stalled`));

  // Observed: This await resolves before the 'ready' event is emitted
  await queue.ready().catch(async err => {
    log(`queue ${side}: queue.ready() error: ${err}`);
    log(`queue ${side}: *** fail *** : shutting down and calling process.exit(1)}`);
    await queue.close(1000).then((err, value) => console.log(`queue ${side}: close(): ${err ? err : value}`));
    redisClient.quit((err, value) => console.log(`redisClient ${side}: quit(): ${err ? err : value}`));
    await delay(1000);
    process.exit(1);
  });

  // Fan out to the client or server logic
  if (side === 'client') {
    //log('process.env.BEEQUEUE_CLIENT:', JSON.stringify(process.env.BEEQUEUE_CLIENT));
    const { doClientQueue } = require('./' + process.env.BEEQUEUE_CLIENT);
    //const { doClientQueue } = require('./' + 'chainClient');
    doClientQueue({queue, verbose, numChains, interval, randomDelay});
  } else {
    doServerQueue({queue, verbose, concurrency, randomDelay});
  }
};


// Server-side Queue.process()
const doServerQueue = ({queue, verbose, concurrency, randomDelay}) => {
  log('doServerQueue:');
  queue.process(concurrency, makeWorker({verbose, randomDelay}));
};


// Fast worker that yields at least once
const makeWorker = ({verbose, randomDelay}) => async job => {
  const { id, data } = job;
  verbose >= 3 && log(`workerProcess: job.id: ${id}, failme: ${data.failme}`);
  if (randomDelay && randomDelay > 0) {
    await delay(Math.floor(Math.random() * randomDelay));
  }
  await new Promise(resolve => setImmediate(resolve));
  if (data.failme) throw new Error(`failme job.id ${id}`);
  return { data };
};

/*
// Simple worker, does very little work, but yields at least once
const workerProcess = async job => {
  const { id, data } = job;
//  log(`workerProcess: job.id: ${id}, data: ${JSON.stringify(data)}`);
  //logJob('workerProcess', job);
  await delay(0);
  if (data.failme) throw new Error(`failme job.id ${id}`);
  await delay(Math.floor(Math.random() * randomDelay));
  return { data };
};
//*/

/*
// Simple worker, does very little work, but yields a few times
const workerProcess = async job => {
  //logJob('workerProcess', job);
  const { id, data } = job;
  //debug && log(`workerProcess: job.id: ${id}`);
  const result = await latencyDude(data);
  if (data.failme) throw new Error(`failme job.id ${id}`);
  return { data, result };
};

// Helper for the worker
const latencyDude = async data => {
  const startTime = Date.now();
  // do something
  const content = JSON.parse(JSON.stringify(data));
  await new Promise(resolve => resolve(content));
  await delay(Math.floor(Math.random() * randomDelay));

  return {
    content,
    latencyMsec: Date.now() - startTime,
  };
};
//*/

// Mostly shared code and config for each instance
const start = async side => {
  if (side !== 'server' && side !== 'client')
    throw new Error(`expected side to be either 'server' or 'client', got '${side}'`);

  // Config for Redis connection
  const redisOptions = {
    host: process.env.REDIS_HOST || undefined,
    port: safeNumber(process.env.REDIS_PORT, undefined),
    password: process.env.REDIS_PASSWORD || undefined,
    socket: process.env.REDIS_SOCKET || undefined,
    // Reconnect with linear backoff to a 15 second interval
    retry_strategy: options => Math.min(options.attempt * 250, 15000),
  };

  log('start: redisOptions:', JSON.stringify(redisOptions));
  const redisClient = createClient(redisOptions);
  // The 'ready' callback from Redis triggers the BeeQueue setup
  redisEvents.forEach(event => redisClient.on(event, makeRedisCallback({redisClient, event, side})));
};

// Fan into the start() choke point
const startClient = () => start('client');
const startServer = () => start('server');

/*
const startClient = () => {
  log('startClient()');
  return start('client');
};

const startServer = () => {
  log('startServer()');
  return start('server');
};
*/

module.exports = exports = {
  startClient,
  startServer,
};
