const { AxiosError } = require('axios/lib/core/AxiosError');
const utils = require('axios/lib/utils');

/**
 * Attach the interceptor to the Axios instance.
 * @param instance The optional Axios instance on which to attach the
 * interceptor.
 * @returns The id of the interceptor attached to the axios instance.
 */
const attach = (axiosInstance) => {
  return axiosInstance.interceptors.response.use(async (response) => {
    const { config } = response;
    // We need to confirm the response is JSON,
    // sometimes Percipio will return a 200 response but it wont be JSON
    if (config.responseType === 'json' || utils.isUndefined(config.responseType)) {
      try {
        if (utils.isString(response.data) && response.data.length) {
          response.data = JSON.parse(response.data);
        }
        return Promise.resolve(response);
      } catch (error) {
        return Promise.reject(
          new AxiosError(
            'Request did not return JSON',
            response.config,
            'ECONNABORTED',
            response.request,
            response
          )
        );
      }
    }
    return Promise.resolve(response);
  }, null);
};

/**
 * Eject the Axios interceptor that is providing JSON check.
 * @param interceptorId The interceptorId provided in the config.
 * @param instance The axios instance using this interceptor.
 */
const detach = (interceptorId, axiosInstance) => {
  axiosInstance.interceptors.response.eject(interceptorId);
};

module.exports = {
  attach,
  detach,
};
