const AxiosError = require('axios/lib/core/AxiosError');
const { accessSafe } = require('access-safe');

/**
 * Attach the interceptor to the Axios instance.
 * @param instance The optional Axios instance on which to attach the
 * interceptor.
 * @returns The id of the interceptor attached to the axios instance.
 */
const attach = (axiosInstance) => {
  return axiosInstance.interceptors.response.use(
    async (response) => {
      // We need to check if the response is JSON, and has a status property
      // Percipio polling will return a JSON object with a status property of IN_PROGRESS
      // until the report data is ready.
      if (
        accessSafe(
          () =>
            response.data.status.localeCompare('IN_PROGRESS', undefined, {
              sensitivity: 'accent',
            }) === 0,
          false
        )
      ) {
        const err = new AxiosError(
          'Report IN_PROGRESS',
          'ECONNABORTED',
          response.config,
          response.request,
          response
        );
        err.reportInProgress = true;
        return Promise.reject(err);
      }
      return Promise.resolve(response);
    },
    (error) => {
      return Promise.reject(error);
    }
  );
};

/**
 * Eject the Axios interceptor that is providing Polling Check.
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
