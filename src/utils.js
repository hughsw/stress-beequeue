const safeNumber = (obj, defaultNum) => isNaN(+obj) ? defaultNum : +obj;
const log = async (...args) => console.log(...args);
const delay = async msec => new Promise(resolve => setTimeout(resolve, msec));
const logJob = (label, {id, data}) => log(`${label}: job.id: ${id}, data: ${JSON.stringify(data)}`);

module.exports = exports = {
  safeNumber,
  log,
  delay,
  logJob,
};
