// Code to demonstrate a bug in BeeQueue whereby a job emits neither the 'succeeded' nor the 'failed' event

// Most of this code is shared by the server (queue with worker logic) and the client (submits jobs to the queue)

import { createClient } from 'redis';
const BeeQueue = require('bee-queue');

// The simple worker function
import { workerProcess } from './server-side';

// The more interesting client logic
import { runJobs } from './client-side';

import { debug, log } from './log';


// Configuration via env vars
const numberOr = (obj:any, defaultNum:number):number => isNaN(+obj) ? defaultNum : +obj;

// Redis connection
const host = process.env.REDIS_HOST || undefined;
const port = numberOr(process.env.REDIS_PORT, undefined);
const password = process.env.REDIS_PASSWORD || undefined;
const socket = process.env.REDIS_SOCKET || undefined;

// Server/worker config
// Number of concurrent jobs to run in the queue
const concurrency = numberOr(process.env.BEEQUEUE_CONCURRENCY, 1);

// Client/job config
// Number of jobs to keep active
const numChains =  numberOr(process.env.BEEQUEUE_NUMCHAINS, 1);
// Number of 'succeeded' events between logging of stats
const interval = numberOr(process.env.BEEQUEUE_INTERVAL, 200);


// Two ways to run this
export const startServer = () => start('server');
export const startClient = () => start('client');

// Mostly shared code
const start = (side:string) => {
  if (side !== 'server' && side !== 'client')
    throw new Error(`expected side to be either 'server' or 'client', got '${side}'`);

  const redisOptions = {
    host: process.env.REDIS_HOST || undefined,
    port: process.env.REDIS_PORT ? +process.env.REDIS_PORT : undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    socket: process.env.REDIS_SOCKET || undefined,

    // Reconnect with linear backoff to a 15 second interval
    retry_strategy: (options:any) => Math.min(options.attempt * 250, 15000),
  };

  // Note: The 'ready' callback from Redis triggers the BeeQueue setup
  const redisCallback = (msg:string) => (value:any) => {
    log(`redisCallback: ${msg}: ${JSON.stringify(value)}`);

    // We'll hang if the 'ready' callback never gets called and there are no errors
    if (msg === 'ready') {
      redisClient.dbsize((err, value) => log('Redis dbsize:', err ? err : value));

      // Start the intersting stuff
      setupBeequeue({ concurrency, numChains, interval });
    }

    // what to do?
    if (msg === 'error') {}
    // what to do? destroy beequeue resources?
    if (msg === 'end') {}
  };


  const redisClient = createClient(redisOptions);

  [ 'connect', 'end', 'error', 'ready', 'reconnecting', 'warning' ]
    .forEach(msg => redisClient.on(msg, redisCallback(msg)));


  const setupBeequeue = async ({concurrency, numChains, interval}) => {
    debug && log('setupBeequeue():');

    const prefix = 'ccd';

    const beequeueName = 'StressBeeQueue';
    const beequeueOptions = {
      activateDelayedJobs: true,
      isWorker: side === 'server',
      prefix,
      redis: redisClient,
      removeOnFailure: true,
      removeOnSuccess: true,
    };

    const queue = new BeeQueue(beequeueName, beequeueOptions);

    // Queue Local Events
    //   from https://github.com/bee-queue/bee-queue#queue-local-events
    queue.on('error', (err:any) => debug && log(`QUEUE ${beequeueName} A queue error happened: ${err.message}`));
    queue.on('succeeded', (job:any, result:any) => debug && log(`QUEUE ${beequeueName} succeeded: Job ${job.id} succeeded with result: ${JSON.stringify(result)}`));
    // Unrelated bug: this event doesn't happen, even though the job is retried and the job gets the 'retrying' event
    // See: https://github.com/bee-queue/bee-queue/issues/184
    queue.on('retrying', (job:any, err:any) => debug && log(`QUEUE ${beequeueName} retrying: Job ${job.id} failed with error '${err.message}' and retries ${job.options.retries}`));
    queue.on('failed', (job:any, err:any) => debug && log(`QUEUE ${beequeueName} failed: Job ${job.id} failed with error '${err.message}', and retries ${job.options.retries}, status ${job.status}`));
    queue.on('stalled', (jobId:string) => debug && log(`QUEUE ${beequeueName} stalled: Job ${jobId} stalled, will be retried`));


    if (side === 'server') {
      // Server

      // Set up processing
      queue.process(concurrency, workerProcess);

      await queue.ready().catch((err:Error) => {
        log('worker BeeQueue : queue.ready() error: ${err}');
        log(`${__filename}: *** fail *** : calling process.exit(1)}`);
        process.exit(1);
      });

      log(`Stress BeeQueue ready: server config: ${JSON.stringify({concurrency})}`);
    } else {
      // Client

      // Wait for queue
      await queue.ready().catch((err:Error) => {
        log('client BeeQueue : queue.ready() error: ${err}');
        log(`${__filename}: *** fail *** : calling process.exit(1)}`);
        process.exit(1);
      });

      // Set up job-chain creation
      await runJobs({queue, numChains, interval}).catch((err:Error) => {
        log('client BeeQueue : runJobs error: ${err}');
        log(`${__filename}: *** fail *** : calling process.exit(1)}`);
        process.exit(1);
      });

      log(`Stress BeeQueue ready: client config: ${JSON.stringify({numChains, interval})}`);
    }
  };
};
