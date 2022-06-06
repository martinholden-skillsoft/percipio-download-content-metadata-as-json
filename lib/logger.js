const { accessSafe } = require('access-safe');
const fs = require('fs');
const Path = require('path');
const _ = require('lodash');
const mkdirp = require('mkdirp');
const { createLogger, format, transports } = require('winston');

const { timestamp, printf } = format;

const defaultLoggingOptions = { label: 'common', correlationid: null };

const getLoggingOptions = (value) => {
  // If its a string then we assume it is a label
  if (_.isString(value)) {
    return { label: value, correlationid: null };
  }
  const result = _.merge({}, defaultLoggingOptions, value);
  return result;
};

const displayFormatter = printf((info) => {
  return `${info.timestamp}\t${info.level}\t${info.label}\t${info.correlationid}\t${info.message}`;
});

const errorFormatter = format((info) => {
  const errorInfo = info;
  const message = [];

  if (info.message instanceof Error) {
    const err = info.message;
    message.push(`Error message: ${err.message}`);
    message.push(`Error code: ${err.code}`);
    if (err.stack) {
      message.push(`Error stack: ${err.stack}`);
    }
    if (err.isAxiosError) {
      if (err.config.correlationid) {
        errorInfo.correlationid = err.config.correlationid;
      }

      // Check for Percipio error messages in response data
      if (accessSafe(() => _.isArray(err.response.data.errors), false)) {
        message.push('Percipio Error Messages: [');
        err.response.data.errors.forEach((value) => {
          message.push(`${JSON.stringify(value)}, `);
        });
        message.push(']');
      }
    }
  }

  if (info instanceof Error) {
    const err = info;
    message.push(`Error message: ${err.message}`);
    message.push(`Error code: ${err.code}`);
    if (err.stack) {
      message.push(`Error stack: ${err.stack}`);
    }
    if (err.isAxiosError) {
      if (err.config.correlationid) {
        errorInfo.correlationid = err.config.correlationid;
      }

      // Check for Percipio error messages in response data
      if (accessSafe(() => _.isArray(err.response.data.errors), false)) {
        message.push('Percipio Error Messages: [');
        err.response.data.errors.forEach((value) => {
          message.push(`${JSON.stringify(value)}, `);
        });
        message.push(']');
      }
    }
  }
  if (message.length > 0) {
    errorInfo.message = message.join(' ');
  }
  return errorInfo;
});

class Logger {
  static loggerInstance;

  constructor(options) {
    this.defaults = {
      path: './log',
      filename: 'log.txt',
      loglevel: 'info',
      formatters: [timestamp(), errorFormatter(), displayFormatter],
    };

    this.options = _.merge({}, this.defaults, options);

    this.formats = format.combine.apply(null, this.options.formatters);

    this.logger = createLogger({
      format: this.formats,
      transports: [
        new transports.Console({
          format: format.combine(format.colorize(), this.formats),
        }),
      ],
      level: 'silly',
    });

    // Enable file logging if path and filename not null
    if (!_.isNull(this.options.path) && !_.isNull(this.options.filename)) {
      if (!fs.existsSync(this.options.path)) {
        mkdirp.sync(this.options.path);
      }

      this.logger.add(
        new transports.File({
          filename: Path.join(this.options.path, this.options.filename),
          options: {
            flags: 'w',
          },
        })
      );
    }

    this.currentLogLevel = this.logger.levels[accessSafe(() => this.options.loglevel, 'info')];
  }

  static getInstance(options) {
    if (_.isUndefined(Logger.loggerInstance)) {
      Logger.loggerInstance = new Logger(options);
    }
    return Logger.loggerInstance;
  }

  add(transport) {
    this.logger.add(transport);
  }

  /**
   * Update the logging level, if invalid level no update
   *
   * @param {string} level- Valid Log Level, one of:
   * error
   * warn
   * info
   * http
   * verbose
   * debug
   * silly
   * @memberof Logger
   */
  update(level) {
    this.currentLogLevel = accessSafe(() => this.logger.levels[level], this.currentLogLevel);
  }

  /**
   * Log message - error level
   *
   * @param {string} message
   * @param {object} [loggingOptions=defaultLoggingOptions]
   * @memberof Logger
   */
  error(message, loggingOptions = defaultLoggingOptions) {
    this.log('error', message, getLoggingOptions(loggingOptions));
  }

  /**
   * Log message - warning level
   *
   * @param {string} message
   * @param {object} [loggingOptions=defaultLoggingOptions]
   * @memberof Logger
   */
  warn(message, loggingOptions = defaultLoggingOptions) {
    this.log('warn', message, getLoggingOptions(loggingOptions));
  }

  /**
   * Log message - http level
   *
   * @param {string} message
   * @param {object} [loggingOptions=defaultLoggingOptions]
   * @memberof Logger
   */
  http(message, loggingOptions = defaultLoggingOptions) {
    this.log('http', message, getLoggingOptions(loggingOptions));
  }

  /**
   * Log message - info level
   *
   * @param {string} message
   * @param {object} [loggingOptions=defaultLoggingOptions]
   * @memberof Logger
   */
  info(message, loggingOptions = defaultLoggingOptions) {
    this.log('info', message, getLoggingOptions(loggingOptions));
  }

  /**
   * Log message - verbose level
   *
   * @param {string} message
   * @param {object} [loggingOptions=defaultLoggingOptions]
   * @memberof Logger
   */
  verbose(message, loggingOptions = defaultLoggingOptions) {
    this.log('verbose', message, getLoggingOptions(loggingOptions));
  }

  /**
   * Log message - debug level
   *
   * @param {string} message
   * @param {object} [loggingOptions=defaultLoggingOptions]
   * @memberof Logger
   */
  debug(message, loggingOptions = defaultLoggingOptions) {
    this.log('debug', message, getLoggingOptions(loggingOptions));
  }

  /**
   * Log message - sillu level
   *
   * @param {string} message
   * @param {object} [loggingOptions=defaultLoggingOptions]
   * @memberof Logger
   */
  silly(message, loggingOptions = defaultLoggingOptions) {
    this.log('silly', message, getLoggingOptions(loggingOptions));
  }

  /**
   * Log message
   *
   * @param {string} level- Valid Log Level, one of:
   * error
   * warn
   * info
   * http
   * verbose
   * debug
   * silly
   * @param {string} message
   * @param {object} [loggingOptions=defaultLoggingOptions]
   * @memberof Logger
   */
  log(level, message, loggingOptions = defaultLoggingOptions) {
    if (this.currentLogLevel >= this.logger.levels[level]) {
      this.logger.log(level, message, loggingOptions);
      return true;
    }
    return false;
  }
}

module.exports = Logger;
