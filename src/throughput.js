const { appendFile } = require('fs');

const {
  safeNumber,
  log,
  delay,
  logJob,
} = require('./utils');


const numChains2 = safeNumber(process.env.BEEQUEUE_NUMCHAINS, 1);

const inPlay = {};
const toggleInPlay = key => {
  return;
  if (inPlay[key]) delete inPlay[key];
  else inPlay[key] = true;
};

// Client-side Queue.createJob()
const doClientQueue = async ({queue, verbose, numChains, failPercent, fixedDelay, randomDelay, interval}) => {

  const maxNumChains = numChains;

  log(`doClientQueue: activeClient: numChains: ${numChains}, failPercent: ${failPercent}, fixedDelay: ${fixedDelay}, randomDelay: ${randomDelay}`);

  stats = {
    startTime: Date.now(),
    globalJobNumber: 0,
    numJobSucceeded: 0,
    numJobFailed: 0,
    numJobSaveError: 0,
    numQueueJobSucceeded: 0,
    numQueueJobFailed: 0,
    numChainsRunning: 0,
  };

  const config = { stats, verbose, failPercent, fixedDelay, randomDelay };

  const adjustChains = (chain = null) => {
    if (chain !== null) {
      if (chain >= numChains) {
        --stats.numChainsRunning;
        return;
      } else {
        createChainJob(queue, config, chain);
      }
    }

    while (stats.numChainsRunning < numChains) {
      createChainJob(queue, config, stats.numChainsRunning);
      ++stats.numChainsRunning;
    }
  };

  const jobFinished = async jobId => {
    toggleInPlay(jobId);
    const job = await queue.getJob(jobId);
    adjustChains(job.data.chain);
    queue.removeJob(jobId);
    //job.removeAllListeners();
  };

  queue.on('job succeeded', async (jobId, result) => {
    ++stats.numQueueJobSucceeded;
    jobFinished(jobId);
  });

  queue.on('job failed', async (jobId, err) => {
    ++stats.numQueueJobFailed;
    jobFinished(jobId);
  });

  adjustChains();
  /*
  while (stats.numChainsRunning < numChains) {
    createChainJob(queue, config, stats.numChainsRunning);
    ++stats.numChainsRunning;
  }
  //*/


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
    await log(JSON.stringify(stats));
    return;

    const startTime = Date.now();
    const startStats = { ...stats };
    await delay(sampleMsec);
    const elapsedMsec = Date.now() - startTime;
    const endStats =  { ...stats };

    const health = await queue.checkHealth();
    await log(`health: ${JSON.stringify(health)}`);

    const jobNumber = endStats.globalJobNumber;
    const numChainsRunning = endStats.numChainsRunning;
    const deltaJobNumber = endStats.globalJobNumber - startStats.globalJobNumber;
    const deltaNumFinished = (endStats.numQueueJobSucceeded + endStats.numQueueJobFailed) - (startStats.numQueueJobSucceeded + startStats.numQueueJobFailed);
    const failureFraction = (endStats.numQueueJobFailed - startStats.numQueueJobFailed) / deltaNumFinished;
    const failurePercent = (failureFraction * 100).toFixed(1);
    const deltaNumLost = deltaNumFinished - ((endStats.numJobSucceeded + endStats.numJobFailed) - (startStats.numJobSucceeded + startStats.numJobFailed));
    const throughput = (deltaNumFinished * 1000 / elapsedMsec).toFixed(0);
    const lossFraction = deltaNumLost / deltaNumFinished;
    const lossPercent = (lossFraction * 100).toFixed(1);
    const inPlayLength = Object.keys(inPlay).length;
    const concurrency = 3;
    const numWorkers = 4;

    const report = {
      startTime,
      elapsedMsec,
      jobNumber,
      numChainsRunning,
      deltaJobNumber,
      deltaNumFinished,
      failurePercent,
      deltaNumLost,
      throughput,
      lossPercent,
      inPlayLength,
      concurrency,
      numWorkers,
    };
    //await log(`jobNumber: ${jobNumber}, numChains: ${numChainsRunning}, elapsedMsec: ${elapsedMsec}, deltaJobNumber: ${deltaJobNumber}, deltaNumFinished: ${deltaNumFinished}, deltaNumLost: ${deltaNumLost}, throughput: ${throughput}, lossPercent: ${lossPercent}`);
    const reportJson = JSON.stringify(report);
    await log(reportJson);
    appendFile(`/data/${stats.startTime}.json`, reportJson + '\n', log);;

    numChains = 1 + Math.floor(Math.random() * maxNumChains);

    /*
    log('numChains:', numChains);

    return;

    const numFinished = stats.numQueueJobSucceeded + stats.numQueueJobFailed;
    const numPlay = jobNumber - numFinished;
    const numLost = numFinished - (stats.numJobSucceeded + stats.numJobFailed);
    const health = await queue.checkHealth();

    const { waitingAvg, activeAvg } = statAvg();
    statReset();
    await log(`jobNumber: ${jobNumber}, numPlay: ${numPlay}, numJobSaveError: ${stats.numJobSaveError}, throughput: ${throughput}, lossPercent: ${lossPercent}, numChainsRunning: ${stats.numChainsRunning}, inPlay: ${Object.keys(inPlay).length}, waitingAvg: ${waitingAvg.toFixed(3)}, activeAvg: ${activeAvg.toFixed(3)}, health: ${JSON.stringify(health)}`);
    //*/

    /*
    const waitingThresh = 0.33;
    if (waitingAvg >= waitingThresh) {
      --adjust;
    } else if (waitingAvg <= waitingThresh - 0.25) {
      ++adjust;
    }
    //*/
  }
  setInterval(doCheck, sampleMsec);

};

/*
  if (false && adjust !== 0) {
    // skip one start
    if (adjust < 0) {
      ++adjust;
      --numChainsRunning;
      return;
    }
    // one additional start
    --adjust;
    createChainJob(queue, config, numChainsRunning);
    ++numChainsRunning;
  }
//*/

const createChainJob = (queue, config, chain) => {
  const { stats, verbose, failPercent, fixedDelay, randomDelay } = config;

  const jobNumber = ++stats.globalJobNumber;
  verbose >= 2 && log(`createChainJob: jobNumber: ${jobNumber}, chain: ${chain}`);

  const delay = (fixedDelay && fixedDelay > 0 ? fixedDelay : 0) + (randomDelay && randomDelay > 0 ? Math.floor(Math.random() * randomDelay) : 0);
  const failme = failPercent && failPercent > 0 ? Math.random() * 100 < failPercent : false;

  const job = queue.createJob({jobNumber, chain, delay, failme});

  /*
  const cleanup = () => job.removeAllListeners();

  job.on('succeeded', async result => {
    verbose >= 2 && log(`job client 'succeeded': job.id: ${job.id}, job.data: ${JSON.stringify(job.data)}`);
    ++stats.numJobSucceeded;
    cleanup();
  });

  job.on('failed', async error => {
    verbose >= 2 && log(`job client 'failed': job.id: ${job.id}, job.data: ${JSON.stringify(job.data)}`);
    ++stats.numJobFailed;
    cleanup();
  });
  //*/

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
