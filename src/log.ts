
export let debug;

debug = true;
// Comment this out to see jobs details; but note that the problem may go away when you do this.
debug = false;

export const log = async (...args) => console.log(...args);
