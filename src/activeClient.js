
const {
  safeNumber,
  log,
  delay,
  logJob,
} = require('./utils');


const numChains2 = safeNumber(process.env.BEEQUEUE_NUMCHAINS, 1);
const succeededHistogram = new Array(numChains2);
succeededHistogram.fill(0);
const failedHistogram = new Array(numChains2);
failedHistogram.fill(0);

let globalJobNumber = 0;

let numJobSucceeded = 0;
let numJobFailed = 0;

let queueNumSucceeded = 0;
let queueNumFailed = 0;

// Client-side Queue.createJob()
const doClientQueue = async ({queue, verbose, numChains, failPercent, randomDelay, interval}) => {
  log(`doClientQueue: activeClient: numChains: ${numChains}, failPercent: ${failPercent}, randomDelay: ${randomDelay}`);

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

  // check number of active jobs and start more as needed
  let numChainsStarted = 0;
  const doCheck = async () => {
    const health = await queue.checkHealth();
    let { active } = health;
    log(`health: ${JSON.stringify(health)}, deficit: ${numChains - active}`);
    while (active++ < numChains) {
      startJobChain(queue, {chain: 0, verbose, failPercent, randomDelay, interval});
      ++numChainsStarted;
    }
    log('numChainsStarted:', numChainsStarted);
  }
  setInterval(doCheck, 3000);

//  for (let chain = 0; chain < numChains; ++chain) {
//    startJobChain({queue, chain, verbose, randomDelay, interval});
//  }
};

const startJobChain = async (queue, config) => {
  const { chain, verbose, failPercent, randomDelay, interval } = config;
  verbose >= 2 && log(`startJobChain: ${JSON.stringify(config)}`);
  //verbose >= 2 && log(`startJobChain: ${JSON.stringify({chain, verbose, failPercent, randomDelay, interval})}`);
  const jobNumber = ++globalJobNumber;

  if (jobNumber % interval === 0) {
    /*
    const maxSucceeded = Math.max(...succeededHistogram);
    const succeededDiffs = succeededHistogram.map(x => maxSucceeded - x);
    const maxFailed = Math.max(...failedHistogram);
    const failedDiffs = failedHistogram.map(x => maxFailed - x);
    //*/

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
    //await log(`jobNumber: ${jobNumber}, succeededDiffs: ${JSON.stringify(succeededDiffs)}`);
    //await log(`jobNumber: ${jobNumber}, failedHistogram: ${JSON.stringify(failedHistogram)}`);
    //await log(`jobNumber: ${jobNumber}, failedDiffs: ${JSON.stringify(failedDiffs)}`);
    //await log(`jobNumber: ${jobNumber}, health: ${JSON.stringify(health)}`);

  }

  //const failme = false;
  //const failme = jobNumber % 2 === 0;
  const delay = randomDelay && randomDelay > 0 ? Math.floor(Math.random() * randomDelay) : 0;
  const failme = failPercent && failPercent > 0 ? Math.random() * 100 < failPercent : false;

  const job = queue.createJob({chain, jobNumber, delay, failme});

  job.on('succeeded', async result => {
    verbose >= 2 && logJob(`job client 'succeeded'`, job);
    ++numJobSucceeded
    //*
    const chain = job.data.chain;
    ++succeededHistogram[chain];
    setTimeout(startJobChain, Math.floor(Math.random() * randomDelay), queue, {chain, verbose, failPercent, randomDelay, interval});
    //*/
  });

  job.on('failed', async error => {
    //logJob(`queue client 'failed'`, job);
    ++numJobFailed;
    //*
    const chain = job.data.chain;
    ++failedHistogram[chain];
    setTimeout(startJobChain, Math.floor(Math.random() * randomDelay), queue, {chain, verbose, failPercent, randomDelay, interval});
    //*/
  });

  await job.save().catch(error => log(`job.save() catch: jobNumber: ${jobNumber}, error: ${error}`))
  verbose >= 2 && logJob('createJob', job);
};

module.exports = exports = {
  doClientQueue,
};
