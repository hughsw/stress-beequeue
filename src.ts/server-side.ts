
import { debug, log } from './log';

// Server side worker

// Simple worker, does very little work, but yields a few times
export const workerProcess = async (job: any) => {
  const { id, data } = job;
  debug && log(`workerProcess: job.id: ${id}`);
  const result = await latencyDude(data);
  if (data.failme) throw new Error(`failme job.id ${id}`);
  return { data, result };
};

// Helper for the worker
const latencyDude = async (data:any) => {
  const startTime = Date.now();
  // do something
  const content = JSON.parse(JSON.stringify(data));
  await new Promise(resolve => resolve(content));

  return {
    content,
    latencyMsec: Date.now() - startTime,
  }
};
