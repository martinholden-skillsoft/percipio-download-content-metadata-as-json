const moment = require('moment');
const defer = require('config/defer').deferConfig;

const config = {};

// Boolean that indicates if the generated CSV should inlcude a UTF-8 Byte Order Marker (BOM).
config.includebom = false;

config.customer = 'default';
config.startTime = moment().utc();
config.startTimestamp = config.startTime.format('YYYYMMDD_HHmmss');

// DEBUG Options
config.debug = {};
config.debug.loglevel = 'info';
config.debug.path = 'results';
config.debug.filename = defer((cfg) => {
  return `${cfg.startTimestamp}_results.log`;
});

// Default for for saving the output
config.output = {};
config.output.path = 'results';
config.output.filename = defer((cfg) => {
  return `${cfg.startTimestamp}_results.json`;
});

// Request
config.request = {};
// Timeout in ms
config.request.timeout = 3 * 60 * 1000;

// Bearer Token
config.request.bearer = null;
// Base URI to Percipio API
config.request.baseURL = null;
// Request Path Parameters
config.request.path = {};
/**
 * Name: orgId
 * Description : Organization UUID
 * Required: true
 * Type: string
 * Format: uuid
 */
config.request.path.orgId = null;

// Request Query string Parameters
config.request.query = {};
/**
 * Name: transformName
 * Description : Value to identify a transform that will map Percipio data into a client
 * specific format
 * Type: string
 */
config.request.query.transformName = null;
/**
 * Name: updatedSince
 * Description : Filter criteria that returns catalog content changes since the date
 * specified in GMT with an ISO format.  Items will be included in the response if the
 * content metadata has changed since the date specified but may also be included if there
 * have been configuration changes that have increased or decreased the number of content
 * items that the organization has access to.
 * Type: string
 * Format: date-time
 */
config.request.query.updatedSince = null;
/**
 * Name: offset
 * Description : Used in conjunction with 'max' to specify which set of 'max' content items
 * should be returned. The default is 0 which returns 1 through max content items. If offset
 * is sent as 1, then content items 2 through max+1 are returned.
 * Type: integer
 */
config.request.query.offset = null;
/**
 * Name: max
 * Description : The maximum number of content items to return in a response. The default is
 * 1000. Valid values are between 1 and 1000.
 * Type: integer
 * Minimum: 1
 * Maximum: 1000
 * Default: 1000
 */
config.request.query.max = 1000;
/**
 * Name: system
 * Description : system name value to be used to look for respecitve ORG SYNC
 * Type: string
 */
config.request.query.system = null;
/**
 * Name: pagingRequestId
 * Description : Used to access the unique dataset to be split among pages of results
 * Type: string
 * Format: uuid
 */
config.request.query.pagingRequestId = null;

// Request Body
config.request.body = null;

// Method
config.request.method = 'get';
// The Service Path
config.request.uritemplate = `/content-discovery/v2/organizations/{orgId}/catalog-content`;

// Global Axios Retry Settings
// see https://github.com/JustinBeckwith/retry-axios
config.rax = {};
// Retry 3 times on requests that return a response (500, etc) before giving up.
config.rax.retry = 5;
// Retry twice on errors that don't return a response (ENOTFOUND, ETIMEDOUT, etc).
config.rax.noResponseRetries = 4;
// You can set the backoff type.
// options are 'exponential' (default), 'static' or 'linear'
config.rax.backoffType = 'exponential';
// The response status codes to retry.  Supports a double
// array with a list of ranges.  Defaults is:
// [[100, 199], [429, 429], [500, 599]]
config.rax.statusCodesToRetry = [
  [100, 199],
  [429, 429],
];

// Bottleneck Limiter
// see https://github.com/SGrondin/bottleneck#job-options
// Percipio API calls are rate-limited to 100 requests / 20 secs per unique service account.
config.bottleneck = {};
// How many jobs can be executed before the limiter stops executing jobs.
// If reservoir reaches 0, no jobs will be executed until it is no longer 0.
// New jobs will still be queued up.
config.bottleneck.reservoir = 20;
// Every reservoirIncreaseInterval milliseconds, the reservoir value will be
// automatically incremented by reservoirIncreaseAmount. Multiple of 250.
config.bottleneck.reservoirIncreaseInterval = 1000;
// The increment applied to reservoir when reservoirIncreaseInterval is in use.
config.bottleneck.reservoirIncreaseAmount = 5;
// The maximum value that reservoir can reach when reservoirIncreaseInterval is in use.
config.bottleneck.reservoirIncreaseMaximum = 20;
// How many jobs can be executing at the same time.
config.bottleneck.maxConcurrent = 10;
// How long to wait after launching a job before launching another one
config.bottleneck.minTime = 500;

module.exports = config;
