export const getAllSearchParams = <T extends Record<string, any>>(
  paramsObj: URLSearchParams
) => {
  const params = {} as Record<string, any>;
  for (const [key, value] of paramsObj.entries()) {
    params[key] = value;
  }
  return params as T;
};
