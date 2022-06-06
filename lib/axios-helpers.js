const { Agent: HttpAgent } = require('http');
const { Agent: HttpsAgent } = require('https');
const Axios = require('axios');
const _ = require('lodash');
const rax = require('retry-axios');
const { v4: uuidv4 } = require('uuid');

const httpAgent = new HttpAgent({ keepAlive: true });
const httpsAgent = new HttpsAgent({ keepAlive: true });

const Logger = require('./logger');
const timingAdapter = require('./timingAdapter');

const expectJSONInterceptor = require('./expectJSONInterceptor');

const createInstance = (options, axios = Axios) => {
  const opts = _.cloneDeep(options);

  const axiosid = `axios-${uuidv4()}`;

  const axiosInstance = axios.create({
    httpAgent,
    httpsAgent,
    adapter: timingAdapter,
    axiosid,
  });

  const logger = Logger.getInstance(opts.debug);

  // RATELIMIT: sets max 25 requests per 1 second, other will be delayed
  const defaults = {
    ratelimit: { maxRequests: 10, perMilliseconds: 1000 },
    rax: {
      logger,
      // You can detect when a retry is happening, and figure out how many
      // retry attempts have been made
      onRetryAttempt: (err) => {
        const raxcfg = rax.getConfig(err);
        raxcfg.logger.debug(`Retry attempt #${raxcfg.currentRetryAttempt}`, {
          label: `onRetryAttempt-${err.config.axiosid}`,
          correlationid: err.config.correlationid,
        });
      },
      // Override the decision making process on if you should retry
      shouldRetry: (err) => {
        const raxcfg = rax.getConfig(err);
        // ensure max retries is always respected
        if (raxcfg.currentRetryAttempt >= raxcfg.retry) {
          raxcfg.logger.error('Maximum retries reached.', {
            label: `shouldRetry-${err.config.axiosid}`,
            correlationid: err.config.correlationid,
          });
          return false;
        }

        // ensure max retries for NO RESPONSE errors is always respected
        if (raxcfg.currentRetryAttempt >= raxcfg.noResponseRetries) {
          raxcfg.logger.error('Maximum retries reached for No Response Errors.', {
            label: `shouldRetry-${err.config.axiosid}`,
            correlationid: err.config.correlationid,
          });
          return false;
        }

        // Always retry if response was not JSON
        if (err.message.includes('Request did not return JSON')) {
          logger.warn(
            `Request did not return JSON. Retry attempt #${raxcfg.currentRetryAttempt}. Retrying request.`,
            {
              label: `shouldRetry-${err.config.axiosid}`,
              correlationid: err.config.correlationid,
            }
          );
          return true;
        }

        // Handle the request based on your other config options, e.g. `statusCodesToRetry`
        if (rax.shouldRetryRequest(err)) {
          raxcfg.logger.warn(`Retry attempt #${raxcfg.currentRetryAttempt}. Retrying request.`, {
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
    },
  };

  // Add Axios Retry
  // see https://github.com/JustinBeckwith/retry-axios
  axiosInstance.defaults.raxConfig = _.merge({}, defaults.rax, opts.rax);
  rax.attach(axiosInstance);

  // Add interceptor that ensures response is JSON
  expectJSONInterceptor.attach(axiosInstance);

  return axiosInstance;
};

module.exports = { createInstance };
