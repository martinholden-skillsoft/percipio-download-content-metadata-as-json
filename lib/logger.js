const { accessSafe } = require('access-safe');
const fs = require('fs');
const Path = require('path');
const _ = require('lodash');
const mkdirp = require('mkdirp');
const { createLogger, format, transports } = require('winston');

const { timestamp, printf } = format;

const defaultLabel = 'common';

const getLabel = (label) => {
  if (_.isString(label)) {
    return label;
  }

  return accessSafe(() => label.label, defaultLabel);
};

const displayFormatter = printf((info) => {
  return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
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
        message.unshift(`CorrelationId: ${err.config.correlationid}`);
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
        message.unshift(`CorrelationId: ${err.config.correlationid}`);
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
   * @param {string|object} [label=common]
   * @memberof Logger
   */
  error(message, label = defaultLabel) {
    this.log('error', message, getLabel(label));
  }

  /**
   * Log message - warning level
   *
   * @param {string} message
   * @param {string|object} [label=common]
   * @memberof Logger
   */
  warn(message, label = defaultLabel) {
    this.log('warn', message, getLabel(label));
  }

  /**
   * Log message - http level
   *
   * @param {string} message
   * @param {string|object} [label=common]
   * @memberof Logger
   */
  http(message, label = defaultLabel) {
    this.log('http', message, getLabel(label));
  }

  /**
   * Log message - info level
   *
   * @param {string} message
   * @param {string|object} [label=common]
   * @memberof Logger
   */
  info(message, label = defaultLabel) {
    this.log('info', message, getLabel(label));
  }

  /**
   * Log message - verbose level
   *
   * @param {string} message
   * @param {string|object} [label=common]
   * @memberof Logger
   */
  verbose(message, label = defaultLabel) {
    this.log('verbose', message, getLabel(label));
  }

  /**
   * Log message - debug level
   *
   * @param {string} message
   * @param {string|object} [label=common]
   * @memberof Logger
   */
  debug(message, label = defaultLabel) {
    this.log('debug', message, getLabel(label));
  }

  /**
   * Log message - sillu level
   *
   * @param {string} message
   * @param {string|object} [label=common]
   * @memberof Logger
   */
  silly(message, label = defaultLabel) {
    this.log('silly', message, getLabel(label));
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
   * @param {string|object} [label=common]
   * @memberof Logger
   */
  log(level, message, label) {
    if (this.currentLogLevel >= this.logger.levels[level]) {
      this.logger.log({
        level,
        message,
        label,
      });
      return true;
    }
    return false;
  }
}

module.exports = Logger;
