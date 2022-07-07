const { Agent: HttpAgent } = require('http');
const { Agent: HttpsAgent } = require('https');
const Axios = require('axios');
const _ = require('lodash');
const rax = require('retry-axios');
const { v4: uuidv4 } = require('uuid');
const { accessSafe } = require('access-safe');
const consola = require('consola');

const httpAgent = new HttpAgent({ keepAlive: true });
const httpsAgent = new HttpsAgent({ keepAlive: true });

const { timingAdapter } = require('./adapters');

const interceptors = require('./interceptors');

const createInstance = (options, axios = Axios) => {
  const opts = options;

  const axiosid = `axios-${uuidv4()}`;

  const axiosInstance = axios.create({
    httpAgent,
    httpsAgent,
    adapter: timingAdapter,
    axiosid,
  });

  const logger = opts.logger || consola;

  const defaults = {
    rax: {
      logger,
      // You can detect when a retry is happening, and figure out how many
      // retry attempts have been made
      onRetryAttempt: (err) => {
        const raxcfg = rax.getConfig(err);

        raxcfg.logger.info(`Retry attempt #${raxcfg.currentRetryAttempt}`, {
          label: `onRetryAttempt-${err.config.axiosid}`,
          correlationid: err.config.correlationid,
        });
      },
      // Override the decision making process on if you should retry
      shouldRetry: (err) => {
        const raxcfg = rax.getConfig(err);

        // Always retry if response is that report is in-progress
        if (accessSafe(() => err.reportInProgress, false)) {
          raxcfg.logger.warn(`Report not ready. Retrying request.`, {
            label: `shouldRetry-${err.config.axiosid}`,
            correlationid: err.config.correlationid,
          });
          return true;
        }

        // Always retry if response was not JSON
        if (accessSafe(() => err.responseIsNotJson, false)) {
          raxcfg.logger.warn(`Request did not return JSON. Retrying request.`, {
            label: `shouldRetry-${err.config.axiosid}`,
            correlationid: err.config.correlationid,
          });
          return true;
        }

        // Handle the request using built in function based on the other
        // config options, e.g. `statusCodesToRetry`
        if (rax.shouldRetryRequest(err)) {
          raxcfg.logger.warn('Retrying request.', {
            label: `shouldRetry-${err.config.axiosid}`,
            correlationid: err.config.correlationid,
          });
          return true;
        }

        raxcfg.logger.error('None retryable error.', {
          label: `shouldRetry-${err.config.axiosid}`,
          correlationid: err.config.correlationid,
        });
        return false;
      },
      instance: axiosInstance,
    },
  };

  // Add interceptor that ensures response is JSON
  interceptors.expectJSONInterceptor.attach(axiosInstance);

  // Add interceptor that ensures response is not a report in progress
  interceptors.pollingInterceptor.attach(axiosInstance);

  // Add Axios Retry after other interceptors
  // see https://github.com/JustinBeckwith/retry-axios
  axiosInstance.defaults.raxConfig = _.merge({}, defaults.rax, opts.rax);
  rax.attach(axiosInstance);

  return axiosInstance;
};

module.exports = { createInstance };
