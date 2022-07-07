/* eslint no-param-reassign: ["error", { "props": false }] */

const httpAdapter = require('axios/lib/adapters/http');
const settle = require('axios/lib/core/settle');
const { v4: uuidv4 } = require('uuid');
const stringifySafe = require('fast-safe-stringify');
const consola = require('consola');

/**
 * Axios Adapter thats adds timing metrics and correlationid
 *
 * @param {*} config axios request configuration
 * @return {Promise}
 */
const timingAdapter = (config) => {
  const sendTime = new Date();

  this.correlationid = config.correlationid || uuidv4();
  const logger = config.logger || consola;

  return new Promise((resolve, reject) => {
    logger.debug(
      `REQUEST: Url: ${config.url}
      ${config.params ? `Params: ${stringifySafe(config.params)}` : ''} ${
        config.data ? `Data: ${stringifySafe(config.data)}` : ''
      }`,
      {
        label: 'timingAdapter',
        correlationid: this.correlationid,
      }
    );

    httpAdapter(config)
      .then((response) => {
        // Always use machine time instead of response.headers.date as this ensures skew
        // Doesnt affect timings
        const receivedTime = new Date();
        response.timings = {
          sent: sendTime,
          received: receivedTime,
          durationms: receivedTime - sendTime,
        };

        logger.debug(
          `RESPONSE: Status: ${response.status}:${response.statusText} Duration ms: ${response.timings.durationms}.`,
          {
            label: 'timingAdapter',
            correlationid: this.correlationid,
          }
        );
        settle(resolve, reject, response);
      })
      .catch((err) => {
        reject(err);
      });
  });
};

module.exports = timingAdapter;
