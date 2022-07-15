require('dotenv-safe').config();

const config = require('config');
const Axios = require('axios');
const fs = require('fs');
const Path = require('path');
const _ = require('lodash');
const mkdirp = require('mkdirp');
const stringifySafe = require('fast-safe-stringify');
const { v4: uuidv4 } = require('uuid');
const Bottleneck = require('bottleneck');
const { accessSafe } = require('access-safe');
const JSONStream = require('JSONStream');
const jsonfile = require('jsonfile');
const Combiner = require('stream-combiner');
const Joi = require('joi');

const pjson = require('./package.json');

const logger = require('./lib/logger').getInstance(config.debug);

const { createInstance } = require('./lib/axios-helpers');

// Create our limiter for managing percipio connections
// This ensures we do not hit the Percipio API rate limits.
const percipioLimiter = new Bottleneck(config.bottleneck);

// Create a Joi schema for validating the lastrun JSON file
const lastrunSchema = Joi.object({
  orgid: Joi.string()
    .guid({
      version: ['uuidv4'],
    })
    .required(),
  updatedSince: Joi.date().iso().required(),
});

/**
 * Process the URI Template strings
 *
 * @param {string} templateString
 * @param {object} templateVars
 * @return {string}
 */
const processTemplate = (templateString, templateVars) => {
  const compiled = _.template(templateString.replace(/{/g, '${'));
  return compiled(templateVars);
};

/**
 * Call Percipio API
 *
 * @param {*} options
 * @param {Axios} [axiosInstance=Axios] HTTP request client that provides an Axios like interface
 * @returns {Promise}
 */
const callPercipio = (options, axiosInstance = Axios) => {
  return new Promise((resolve, reject) => {
    const opts = _.cloneDeep(options);
    const requestUri = processTemplate(opts.request.uritemplate, opts.request.path);

    let requestParams = opts.request.query || {};
    requestParams = _.omitBy(requestParams, _.isNil);

    let requestBody = opts.request.body || {};
    requestBody = _.omitBy(requestBody, _.isNil);

    const axiosConfig = {
      baseURL: opts.request.baseURL,
      url: requestUri,
      headers: {
        Authorization: `Bearer ${opts.request.bearer}`,
      },
      method: opts.request.method,
      timeout: opts.request.timeout || 2000,
      correlationid: opts.request.correlationid || uuidv4(),
      logger,
    };

    if (!_.isEmpty(requestBody)) {
      axiosConfig.data = requestBody;
    }

    if (!_.isEmpty(requestParams)) {
      axiosConfig.params = requestParams;
    }

    axiosInstance
      .request(axiosConfig)
      .then((response) => {
        const { params, correlationid } = response.config;
        const { status, statusText, timings, headers, data } = response;

        const cleanedResponse = {
          config: { params, correlationid },
          data,
          headers,
          status,
          statusText,
          timings,
        };

        resolve(cleanedResponse);
      })
      .catch((err) => {
        reject(err);
      });
  });
};

/**
 * Request one item so we can get count
 *
 * @param {*} options
 * @param {Axios} [axiosInstance=Axios] HTTP request client that provides an Axios like interface
 * @returns {Promise} Promise object resolves to obect with total and pagingRequestId.
 */
const getRecordCount = (options, axiosInstance = Axios) => {
  return new Promise((resolve, reject) => {
    const loggingOptions = {
      label: 'getRecordCount',
    };

    const opts = _.cloneDeep(options);
    opts.request.query.max = 1;
    opts.request.correlationid = uuidv4();

    loggingOptions.correlationid = opts.request.correlationid;
    logger.info('Requesting single record to determine count of available.', loggingOptions);

    const results = {
      total: null,
      pagingRequestId: null,
    };

    callPercipio(opts, axiosInstance)
      .then((response) => {
        results.total = parseInt(response.headers['x-total-count'], 10);
        results.pagingRequestId = response.headers['x-paging-request-id'] || null;

        loggingOptions.correlationid = accessSafe(() => response.config.correlationid, null);

        const message = [];
        message.push(`Total Records ['x-total-count']: ${results.total.toLocaleString()}`);

        if (results.pagingRequestId !== null) {
          message.push(`Paging request id ['x-paging-request-id']: ${results.pagingRequestId}`);
        }
        logger.info(`${message.join(' ')}`, loggingOptions);
        resolve(results);
      })
      .catch((err) => {
        logger.error(err, loggingOptions);
        reject(err);
      });
  });
};

/**
 * Calling the API to retrieve and process page.
 *
 * @param {*} options
 * @param {Number} offset the offset position of the page
 * @param {Combiner} [processChain=new Combiner([])] the processing stream for the results
 * @param {Axios} [axiosInstance=Axios] HTTP request client that provides an Axios like interface
 * @returns {Promise} Resolves to number of records processed
 */
const getPage = (options, offset, processChain = new Combiner([]), axiosInstance = Axios) => {
  return new Promise((resolve, reject) => {
    const loggingOptions = {
      label: 'getPage',
    };

    const opts = _.cloneDeep(options);
    opts.request.query.offset = offset;
    opts.request.correlationid = uuidv4();

    loggingOptions.correlationid = opts.request.correlationid;

    const message = [];
    message.push(
      `Records Requested: ${opts.request.query.offset.toLocaleString()} to ${(
        opts.request.query.offset + opts.request.query.max
      ).toLocaleString()}.`
    );
    logger.info(`${message.join(' ')}`, loggingOptions);

    callPercipio(opts, axiosInstance)
      .then((response) => {
        const result = {
          count: accessSafe(() => response.data.length, 0),
          start: accessSafe(() => response.config.params.offset, 0),
          end:
            accessSafe(() => response.config.params.offset, 0) +
            accessSafe(() => response.config.params.max, 0),
          durationms: accessSafe(() => response.timings.durationms, null),
          sent: accessSafe(() => response.timings.sent.toISOString(), null),
          correlationid: accessSafe(() => response.config.correlationid, null),
        };

        loggingOptions.correlationid = result.correlationid;

        const responsemessage = [];
        responsemessage.push(
          `Records Requested: ${result.start.toLocaleString()} to ${result.end.toLocaleString()}.`
        );
        responsemessage.push(`Duration ms: ${result.durationms}.`);
        responsemessage.push(`Records Returned: ${result.count.toLocaleString()}.`);
        logger.info(`${responsemessage.join(' ')}`, loggingOptions);

        if (result.count > 0) {
          response.data.forEach((record) => {
            processChain.write(record);
          });
          resolve(result);
        } else {
          resolve(result);
        }
      })
      .catch((err) => {
        logger.error(err, loggingOptions);
        reject(err);
      });
  });
};

/**
 * Loop thru calling the API until all pages are delivered.
 *
 * @param {*} options
 * @param {int} maxrecords The total number of records to retrieve
 * @param {Axios} [axiosInstance=Axios] HTTP request client that provides an Axios like interface
 * @returns {Promise} resolves to boolean to indicate if results saved and the filename
 */
const getAllPages = (options, maxrecords, axiosInstance = Axios) => {
  return new Promise((resolve, reject) => {
    const loggingOptions = {
      label: 'getAllPages',
    };

    const opts = _.cloneDeep(options);
    const outputFile = Path.join(opts.output.path, opts.output.filename);

    let downloadedRecords = 0;
    // Array to hold the requests the got rejected/failed
    let failedRequests = [];

    const jsonStream = JSONStream.stringify('[', ',', ']');
    const outputStream = fs.createWriteStream(outputFile);

    if (opts.includebom) {
      outputStream.write(Buffer.from('\uFEFF'));
    }

    outputStream.on('error', (err) => {
      logger.error(err, loggingOptions);
      reject(err);
    });

    jsonStream.on('error', (err) => {
      logger.error(err, loggingOptions);
      reject(err);
    });

    outputStream.on('finish', () => {
      let saved = false;
      if (downloadedRecords === 0) {
        logger.info('No records downloaded', loggingOptions);
        fs.unlinkSync(outputFile);
      } else {
        logger.info(
          `Total Records Downloaded: ${downloadedRecords.toLocaleString()}`,
          loggingOptions
        );
        saved = true;
        logger.info(`Records Saved. Path: ${outputFile}`, loggingOptions);
      }

      resolve({ saved, outputFile, failedRequests });
    });

    const chain = new Combiner([jsonStream, outputStream]);
    chain.on('error', (err) => {
      logger.error(err, loggingOptions);
      reject(err);
    });

    const wrapperGetPage = percipioLimiter.wrap(getPage);

    const requests = [];
    for (let index = 0; index <= maxrecords; index += opts.request.query.max) {
      requests.push(wrapperGetPage(opts, index, chain, axiosInstance));
    }

    Promise.allSettled(requests)
      .then((data) => {
        failedRequests = data.filter((request) => {
          return request.status === 'rejected';
        });

        downloadedRecords = data.reduce((total, currentValue) => {
          const count = accessSafe(() => currentValue.value.count, 0);
          return total + count;
        }, 0);

        // Once we've written each record in the record-set, we have to end the stream so that
        // the TRANSFORM stream knows to output the end of the array it is generating.
        chain.end();
      })
      .catch((err) => {
        logger.error(err, loggingOptions);
        reject(err);
      });
  });
};

/**
 * Process the Percipio call
 *
 * @param {*} options
 * @returns
 */
const main = (configOptions) => {
  const loggingOptions = {
    label: 'main',
  };

  const options = configOptions ? { ...configOptions } : null;
  options.logger = logger;

  if (_.isNull(options)) {
    logger.error('Invalid configuration', loggingOptions);
    return false;
  }

  // Create logging folder if one does not exist
  if (!_.isNull(options.debug.path)) {
    if (!fs.existsSync(options.debug.path)) {
      mkdirp.sync(options.debug.path);
    }
  }

  // Create output folder if one does not exist
  if (!_.isNull(options.output.path)) {
    if (!fs.existsSync(options.output.path)) {
      mkdirp.sync(options.output.path);
    }
  }

  logger.info(`Start ${pjson.name} - v${pjson.version}`, loggingOptions);

  logger.debug(`Options: ${stringifySafe(options)}`, loggingOptions);

  logger.info('Calling Percipio', loggingOptions);

  const lastrunFile = 'lastrun.json';

  // If the updatedSince query parameter does not existsm,
  // then we need to check the lastrun.json file.
  if (_.isNull(options.request.query.updatedSince)) {
    if (fs.existsSync(lastrunFile)) {
      const lastrun = jsonfile.readFileSync(lastrunFile);
      const validation = lastrunSchema.validate(lastrun);

      if (!validation.error) {
        if (lastrun.orgid === options.request.path.orgId) {
          options.request.query.updatedSince = lastrun.updatedSince;

          logger.info(
            `Request updatedSince filter set to: ${options.request.query.updatedSince}`,
            loggingOptions
          );
        } else {
          fs.unlinkSync(lastrunFile);
          logger.info('Last run file from different orgid and so deleted', loggingOptions);
        }
      } else {
        fs.unlinkSync(lastrunFile);
        logger.info(
          `Last run file was not valid and so deleted. ${validation.error}`,
          loggingOptions
        );
      }
    }
  }

  // Create an axios instance
  const axiosInstance = createInstance(options, Axios);
  options.axiosInstance = axiosInstance;

  getRecordCount(options, axiosInstance)
    .then((response) => {
      // Percipio API returns a paged response, so retrieve all pages
      options.request.query.pagingRequestId = response.pagingRequestId;

      if (response.total > 0) {
        getAllPages(options, response.total, axiosInstance)
          .then((data) => {
            if (accessSafe(() => data.failedRequests.length, 0) > 0) {
              logger.error(
                `Failed to completed download. ${data.failedRequests.length} requests failed.`,
                loggingOptions
              );
            } else {
              const obj = {
                orgid: options.request.path.orgId,
                updatedSince: options.startTime.format(),
              };
              jsonfile.writeFileSync(lastrunFile, obj);
              logger.info(
                `Last successful run information stored in ${lastrunFile}`,
                loggingOptions
              );
            }
            logger.info(`End ${pjson.name} - v${pjson.version}`, loggingOptions);
          })
          .catch((err) => {
            logger.error(err, loggingOptions);
          });
      } else {
        logger.info('No records to download', loggingOptions);
        logger.info(`End ${pjson.name} - v${pjson.version}`, loggingOptions);
      }
    })
    .catch((err) => {
      logger.error(err, loggingOptions);
      logger.info(`End ${pjson.name} - v${pjson.version}`, loggingOptions);
    });

  return true;
};

try {
  main(config);
} catch (error) {
  throw new Error(`A problem occurred during configuration. ${error.message}`);
}
