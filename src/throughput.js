
const {
  safeNumber,
  log,
  delay,
  logJob,
} = require('./utils');


const numChains2 = safeNumber(process.env.BEEQUEUE_NUMCHAINS, 1);

/*
let globalJobNumber = 0;

let numJobSucceeded = 0;
let numJobFailed = 0;
let numJobSaveError = 0;

let numQueueJobSucceeded = 0;
let numQueueJobFailed = 0;

let numChainsStarted = 0;

let adjust = 0;
//*/

const inPlay = {};
const toggleInPlay = key => {
  if (inPlay[key]) delete inPlay[key];
  else inPlay[key] = true;
};

// Client-side Queue.createJob()
const doClientQueue = async ({queue, verbose, numChains, failPercent, fixedDelay, randomDelay, interval}) => {
//  const startTime =
  log(`doClientQueue: activeClient: numChains: ${numChains}, failPercent: ${failPercent}, fixedDelay: ${fixedDelay}, randomDelay: ${randomDelay}`);

  stats = {
    startTime: Date.now(),
    globalJobNumber: 0,
    numJobSucceeded: 0,
    numJobFailed: 0,
    numJobSaveError: 0,
    numQueueJobSucceeded: 0,
    numQueueJobFailed: 0,
    numChainsStarted: 0,
  };

  //const config = { chain: 0, verbose, failPercent, randomDelay, interval };
  const config = { stats, verbose, failPercent, fixedDelay, randomDelay };

  const jobFinished = async jobId => {
    //setTimeout(() => delete inPlay[jobId], 33);
    toggleInPlay(jobId);
    const job = await queue.getJob(jobId);
    queue.removeJob(jobId);
    //log(`jobFinished: job.data: ${JSON.stringify(job.data)}`);
    createChainJob(queue, config, job.data.chain);
  };

  queue.on('job succeeded', async (jobId, result) => {
    //log(`queue client 'job succeeded': jobId: ${jobId}`);
    ++stats.numQueueJobSucceeded;
    jobFinished(jobId);
    //setTimeout(() => delete inPlay[jobId], 1);
    //createChainJob(queue, config);
  });

  queue.on('job failed', async (jobId, err) => {
    //log(`queue client 'job failed': jobId: ${jobId}`);
    ++stats.numQueueJobFailed;
    jobFinished(jobId);
    // delay, or otherwise we can delete a jobId before it's been added
    //setTimeout(() => delete inPlay[jobId], 1);
    //delete inPlay[jobId];
    //createChainJob(queue, config);
  });

  while (stats.numChainsStarted < numChains) {
    createChainJob(queue, config, stats.numChainsStarted);
    ++stats.numChainsStarted;
  }

  // check number of active jobs and start more as needed

  let waitingSum;
  let activeSum;
  let statCount;
  const statReset = () => {
    waitingSum = 0;
    activeSum = 0;
    statCount = 0;
  };
  const statSum = ({ waiting, active }) => {
    waitingSum += waiting;
    activeSum += active;
    ++statCount;
  };
  const statAvg = () => ({
    waitingAvg: waitingSum / statCount,
    activeAvg: activeSum / statCount,
  });
  const statSample = async () => {
    const { waiting, active } = await queue.checkHealth();
    statSum({ waiting, active });
  };

  statReset();
  setInterval(statSample, 16);

  const sampleMsec = 3000;

  const doCheck = async () => {
    const startTime = Date.now();
    const startStats = { ...stats };
    await delay(sampleMsec);
    const elapsedMsec = Date.now() - startTime;
    const endStats =  { ...stats };

    const jobNumber = endStats.globalJobNumber;
    const deltaJobNumber = endStats.globalJobNumber - startStats.globalJobNumber;
    const deltaNumFinished = (endStats.numQueueJobSucceeded + endStats.numQueueJobFailed) - (startStats.numQueueJobSucceeded + startStats.numQueueJobFailed);
    const deltaNumLost = deltaNumFinished - ((endStats.numJobSucceeded + endStats.numJobFailed) - (startStats.numJobSucceeded + startStats.numJobFailed));
    const throughput = (deltaNumFinished * 1000 / elapsedMsec).toFixed(0);
    const lossFraction = deltaNumLost / deltaNumFinished;
    const lossPercent = (lossFraction * 100).toFixed(1);
    await log(`jobNumber: ${jobNumber}, elapsedMsec: ${elapsedMsec}, deltaJobNumber: ${deltaJobNumber}, deltaNumFinished: ${deltaNumFinished}, deltaNumLost: ${deltaNumLost}, throughput: ${throughput}, lossPercent: ${lossPercent}`);
    return;

    const numFinished = stats.numQueueJobSucceeded + stats.numQueueJobFailed;
    const numPlay = jobNumber - numFinished;
    const numLost = numFinished - (stats.numJobSucceeded + stats.numJobFailed);

    //const inPlay = jobNumber - numFinished;

    //const missingSucceeded = numQueueJobSucceeded - numJobSucceeded;
    //const missingFailed = numQueueJobFailed - numJobFailed;
    //const counts = { numQueueJobSucceeded, missingSucceeded, numQueueJobFailed, missingFailed };
    const health = await queue.checkHealth();
    //await log(`jobNumber: ${jobNumber}, numChainsStarted: ${numChainsStarted}, health: ${JSON.stringify(health)}, counts: ${JSON.stringify(counts)}`);
    //await log(`jobNumber: ${jobNumber}, numChainsStarted: ${numChainsStarted}, health: ${JSON.stringify(health)}, throughput: ${throughput}, lossPercent: ${lossPercent}`);
    const { waitingAvg, activeAvg } = statAvg();
    statReset();
    await log(`jobNumber: ${jobNumber}, numPlay: ${numPlay}, numJobSaveError: ${stats.numJobSaveError}, throughput: ${throughput}, lossPercent: ${lossPercent}, numChainsStarted: ${stats.numChainsStarted}, inPlay: ${Object.keys(inPlay).length}, waitingAvg: ${waitingAvg.toFixed(3)}, activeAvg: ${activeAvg.toFixed(3)}, health: ${JSON.stringify(health)}`);
    //await log(`jobNumber: ${jobNumber}, throughput: ${throughput}, lossPercent: ${lossPercent}, numChainsStarted: ${numChainsStarted}, inPlay: ${inPlay}, health: ${JSON.stringify(health)}`);

    //const waitingThresh = 3.5;
    const waitingThresh = 0.33;
    if (waitingAvg >= waitingThresh) {
      --adjust;
    } else if (waitingAvg <= waitingThresh - 0.25) {
      ++adjust;
    }
  }
  setInterval(doCheck, sampleMsec);

};

/*
  if (false && adjust !== 0) {
    // skip one start
    if (adjust < 0) {
      ++adjust;
      --numChainsStarted;
      return;
    }
    // one additional start
    --adjust;
    createChainJob(queue, config, numChainsStarted);
    ++numChainsStarted;
  }
//*/

//const createChainJob = async (queue, config) => {
const createChainJob = (queue, config, chain) => {

  //const { chain, verbose, failPercent, randomDelay, interval } = config;
  const { stats, verbose, failPercent, fixedDelay, randomDelay } = config;

  const jobNumber = ++stats.globalJobNumber;
  //verbose >= 2 && log(`createChainJob: jobNumber: ${jobNumber}, chain: ${chain}, ${JSON.stringify(config)}`);
  verbose >= 2 && log(`createChainJob: jobNumber: ${jobNumber}, chain: ${chain}`);

  const delay = (fixedDelay && fixedDelay > 0 ? fixedDelay : 0) + (randomDelay && randomDelay > 0 ? Math.floor(Math.random() * randomDelay) : 0);
  const failme = failPercent && failPercent > 0 ? Math.random() * 100 < failPercent : false;

  const job = queue.createJob({jobNumber, chain, delay, failme});

  job.on('succeeded', async result => {
    verbose >= 2 && log(`job client 'succeeded': job.id: ${job.id}, job.data: ${JSON.stringify(job.data)}`);
    ++stats.numJobSucceeded;
  });

  job.on('failed', async error => {
    verbose >= 2 && log(`job client 'failed': job.id: ${job.id}, job.data: ${JSON.stringify(job.data)}`);
    ++stats.numJobFailed;
  });

  job.save()
    .then(() => {
      verbose >= 2 && log(`job.save(): job.id: ${job.id}, job.data: ${JSON.stringify(job.data)}`);
      toggleInPlay(job.id);
    })
    .catch(error => {
      log(`job.save() catch: jobNumber: ${jobNumber}, error: ${error}`);
      ++stats.numJobSaveError;
    });

};

module.exports = exports = {
  doClientQueue,
};
