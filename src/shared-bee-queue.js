const { createClient } =  require('redis');
const BeeQueue = require('bee-queue');

const safeNumber = (obj, defaultNum) => isNaN(+obj) ? defaultNum : +obj;
const log = async (...args) => console.log(...args);
const delay = async msec => new Promise(resolve => setTimeout(resolve, msec));


/*
// Server/worker config
// Number of concurrent jobs to run in the queue
const concurrency = safeNumber(process.env.BEEQUEUE_CONCURRENCY, 1);

// Client/job config
// Number of jobs to keep active
const numChains =  safeNumber(process.env.BEEQUEUE_NUMCHAINS, 1);
// Number of 'succeeded' events between logging of stats
const interval = safeNumber(process.env.BEEQUEUE_INTERVAL, 200);

const randomDelay = safeNumber(process.env.BEEQUEUE_RANDOM_DELAY, 0);
*/

/*
const host =
const port =
const password =
const socket =
*/

const redisEvents = [ 'connect', 'end', 'error', 'ready', 'reconnecting', 'warning' ];

// Note: The 'ready' callback from Redis triggers the Beequeue setup
const makeRedisCallback = ({redisClient, event, side}) => value => {
  log(`redisClient ${side}: '${event}': ${JSON.stringify(value)}`);

  // We'll hang if the 'ready' callback never gets called and there are no errors
  if (event === 'ready') {
    redisClient.dbsize((err, size) => log(`redisClient ${side}: dbsize: ${err ? err : size}`))

    const queueConfig = {
      side,
      verbose: 0,

      // Client
      // Number of jobs to (try to) keep active
      numChains: safeNumber(process.env.BEEQUEUE_NUMCHAINS, 1),
      // Number of 'succeeded' events between logging of stats
      interval: safeNumber(process.env.BEEQUEUE_INTERVAL, 200),
      randomDelay: safeNumber(process.env.BEEQUEUE_RANDOM_DELAY, 0),

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
    //getEvents: isClient,
  };

  const queue = new BeeQueue(beequeueName, beequeueOptions);

  // Log these Queue events regardless of side because they are rare in this use case
  queue.on('ready', () => log(`QUEUE ${beequeueName} 'ready'`));
  queue.on('error', err => log(`QUEUE ${beequeueName} 'error': A queue error happened: ${err.message}`));
  // Unrelated bug: the retrying event doesn't happen, even though the job is retried and the job gets the 'retrying' event
  // See: https://github.com/bee-queue/bee-queue/issues/184
  queue.on('retrying', (job, err) => log(`QUEUE ${beequeueName} 'retrying': Job ${job.id} failed with error '${err.message}' and retries ${job.options.retries}`));
  queue.on('stalled', jobId => log(`QUEUE ${beequeueName} 'stalled': Job ${jobId} stalled`));

  // Frequent on some sides
  // queue.on('succeeded', (job:any, result:any) => debug && log(`QUEUE ${beequeueName} succeeded: Job ${job.id} succeeded with result: ${JSON.stringify(result)}`));
  // queue.on('failed', (job:any, err:any) => debug && log(`QUEUE ${beequeueName} failed: Job ${job.id} failed with error '${err.message}', and retries ${job.options.retries}, status ${job.status}`));

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
  side === 'client'
    ? doClientQueue({queue, verbose, numChains, interval, randomDelay})
    : doServerQueue({queue, verbose, concurrency, randomDelay});

  /*
  await delay(side === 'client' ? 500 : 1000);
  await queue.close(1000, (err, value) => console.log(`queue ${side}: close(): ${err ? err : value}`));
  redisClient.quit((err, value) => console.log(`redisClient ${side}: quit(): ${err ? err : value}`));
  //*/
};

const logJob = (label, {id, data}) => log(`${label}: job.id: ${id}, data: ${JSON.stringify(data)}`);


const numChains2 = safeNumber(process.env.BEEQUEUE_NUMCHAINS, 1);
const succeededHistogram = new Array(numChains2);
succeededHistogram.fill(0);
const failedHistogram = new Array(numChains2);
failedHistogram.fill(0);

//const succeededHistogram = [];
//const failedHistogram = [];

let globalJobNumber = 0;

let numJobSucceeded = 0;
let numJobFailed = 0;

let queueNumSucceeded = 0;
let queueNumFailed = 0;

// Client-side Queue.createJob()
const doClientQueue = async ({queue, verbose, numChains, randomDelay, interval}) => {
  log(`doClientQueue: numChains: ${numChains}, randomDelay: ${randomDelay}`);

  queue.on('job succeeded', async (jobId, result) => {
  //queue.on('succeeded', async (job, result) => {
    //log(`queue client 'job succeeded': jobId: ${jobId}`);
    ++queueNumSucceeded;
    /*
    const job = await queue.getJob(jobId).catch(error => log(`succeeded: queue.getJob: error; ${error}`));
    //log(`queue client 'job succeeded': job: ${job}`);
    const chain = job.data.chain;
    ++succeededHistogram[chain];
    setTimeout(startJobChain, Math.floor(Math.random() * randomDelay), {queue, chain, verbose, randomDelay, interval});
    //*/

    //setTimeout(startJobChain, delay(), queue);
    //setTimeout(startJobChain, 0, queue);
  });

  queue.on('job failed', async (jobId, err) => {
  //queue.on('failed', async (job, err) => {
    ++queueNumFailed;
    /*
    const job = await queue.getJob(jobId).catch(error => log(`failed: queue.getJob: error; ${error}`));
    const chain = job.data.chain;
    ++failedHistogram[chain];
    setTimeout(startJobChain, Math.floor(Math.random() * randomDelay), {queue, chain, verbose, randomDelay, interval});
    //*/

    //logJob(`queue client 'failed'`, job);
    //setTimeout(startJobChain, 0, queue);
  });

//debug && log(`QUEUE ${beequeueName} succeeded: Job ${job.id} succeeded with result: ${JSON.stringify(result)}`));
  // queue.on('failed', (job:any, err:any) => debug && log(`QUEUE ${beequeueName} failed: Job ${job.id} failed with error '${err.message}', and retries ${job.options.retries}, status ${job.status}`));

  for (let chain = 0; chain < numChains; ++chain) {
    startJobChain({queue, chain, verbose, randomDelay, interval});
  }

  /*
  return;

  const job = await queue.createJob({foo: 'bar'}).save()
  //log(`createJob: job.id: ${job.id}, data: ${JSON.stringify(job.data)}`);
  logJob('createJob', job);
  const job2 = await queue.createJob({failme: true}).save()
  //log(`createJob: job.id: ${job2.id}, data: ${job2.data}`);
  logJob('createJob', job2);
  //*/
};
const startJobChain = async ({queue, chain, verbose, randomDelay, interval}) => {
  verbose >= 2 && log(`startJobChain: ${JSON.stringify({chain, verbose, randomDelay, interval})}`);
  const jobNumber = ++globalJobNumber;

  if (jobNumber % interval === 0) {
    const maxSucceeded = Math.max(...succeededHistogram);
    const succeededDiffs = succeededHistogram.map(x => maxSucceeded - x);
    const maxFailed = Math.max(...failedHistogram);
    const failedDiffs = failedHistogram.map(x => maxFailed - x);

    const missingSucceeded = queueNumSucceeded - numJobSucceeded;
    const missingFailed = queueNumFailed - numJobFailed;
    //const counts = { queueNumSucceeded, missingSucceeded, queueNumFailed, missingFailed };
    const counts = { queueNumSucceeded, missingSucceeded, queueNumFailed, missingFailed };
    const health = await queue.checkHealth();
    await log(`jobNumber: ${jobNumber}, counts: ${JSON.stringify(counts)}`);
    //const counts = { jobNumber, queueNumSucceeded, queueNumFailed, numJobSucceeded, numJobFailed };
    //log(`jobNumber: ${jobNumber}, counts: ${JSON.stringify(counts)}, health: ${JSON.stringify(health)}`);
    //await log(`jobNumber: ${jobNumber}, counts: ${JSON.stringify(counts)}, health: ${JSON.stringify(health)}`);
    //await log(`jobNumber: ${jobNumber}, succeededHistogram: ${JSON.stringify(succeededHistogram)}`);
    await log(`jobNumber: ${jobNumber}, succeededDiffs: ${JSON.stringify(succeededDiffs)}`);
    //await log(`jobNumber: ${jobNumber}, failedHistogram: ${JSON.stringify(failedHistogram)}`);
    //await log(`jobNumber: ${jobNumber}, failedDiffs: ${JSON.stringify(failedDiffs)}`);
    await log(`jobNumber: ${jobNumber}, health: ${JSON.stringify(health)}`);

  }

  const failme = false;
  //const failme = jobNumber % 2 === 0;

  const job = queue.createJob({chain, jobNumber, failme});

  //job.on('succeeded', () => ++numJobSucceeded);
  //job.on('failed', () => ++numJobFailed);
  //job.on('succeeded', () => (++numJobSucceeded, logJob(`job 'succeeded'`, job)));
  //job.on('failed', () => (++numJobFailed, logJob(`job 'failed'`, job)));

  job.on('succeeded', async result => {
    verbose >= 2 && logJob(`job client 'succeeded'`, job);
    ++numJobSucceeded
    //*
    const chain = job.data.chain;
    ++succeededHistogram[chain];
    setTimeout(startJobChain, Math.floor(Math.random() * randomDelay), {queue, chain, verbose, randomDelay, interval});
    //*/

    //setTimeout(startJobChain, 0, {queue, chain});
    //setTimeout(startJobChain, delay(), queue);
  });

  job.on('failed', async error => {
    //logJob(`queue client 'failed'`, job);
    ++numJobFailed;
    //*
    const chain = job.data.chain;
    ++failedHistogram[chain];
    setTimeout(startJobChain, Math.floor(Math.random() * randomDelay), {queue, chain, verbose, randomDelay, interval});
    //*/

    //setTimeout(startJobChain, 0, {queue, chain});
    //setTimeout(startJobChain, delay(Math.floor(Math.random() * randomDelay)), queue);
  });


  await job.save().catch(error => log(`job.save() catch: jobNumber: ${jobNumber}, error: ${error}`))
  verbose >= 2 && logJob('createJob', job);
};

// Server-side Queue.process()
const doServerQueue = ({queue, verbose, concurrency, randomDelay}) => {
  log('doServerQueue:');
  queue.process(concurrency, makeWorker({verbose, randomDelay}));
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

const makeWorker = ({verbose, randomDelay}) => async job => {
  //logJob('workerProcess', job);
  const { id, data } = job;
  verbose >= 3 && log(`workerProcess: job.id: ${id}, failme: ${data.failme}`);
  //  const result = await latencyDude(data);
  if (randomDelay && randomDelay > 0) {
    await delay(Math.floor(Math.random() * randomDelay));
  }
  if (data.failme) throw new Error(`failme job.id ${id}`);
  return { data };
};

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
  // So, we no longer have a stack for the caller...
  redisEvents.forEach(event => redisClient.on(event, makeRedisCallback({redisClient, event, side})));
};

// Fan into the start() choke point
const startClient = () => {
  log('startClient()');
  return start('client');
};

const startServer = () => {
  log('startServer()');
  return start('server');
};


module.exports = exports = {
  startClient,
  startServer,
};
