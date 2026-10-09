'use strict';
const { parentPort } = require('node:worker_threads');
const { Network, predict } = require('./interaction.cjs');
parentPort.on('message', ([request]) => {
  try {
    const models = request.models.map(Network.fromJSON);
    const result = [];
    for (let i = request.start; i < request.end; i++) {
      const x = new Float64Array(request.buffer, i * request.input * 8, request.input);
      result.push(predict(models, x, request.references));
    }
    parentPort.postMessage({ result, heapBytes: process.memoryUsage().heapUsed });
  } catch (error) { parentPort.postMessage({ error: error.stack }); }
});
