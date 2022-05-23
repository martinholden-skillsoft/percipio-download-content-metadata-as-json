const config = {};

// Boolean that indicates if a Byte Order Marker should be written to output files
// Using json means the true/false environment variable STRINGS are parsed to booleans.
config.includebom = {
  __name: 'INCLUDEBOM',
  __format: 'json',
};

config.debug = {};
config.debug.loglevel = 'LOGLEVEL';

config.request = {};
config.request.bearer = 'BEARER';
// Base URI to Percipio API
config.request.baseURL = 'BASEURL';
// Request Path Parameters
config.request.path = {};
/**
 * Name: orgId
 * Description: Organization UUID
 * Required: true
 * Type: string
 * Format: uuid
 */
config.request.path.orgId = 'ORGID';

module.exports = config;
