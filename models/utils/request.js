import axios from 'axios'
import { HttpProxyAgent } from 'http-proxy-agent'
import { HttpsProxyAgent } from 'https-proxy-agent'

/**
 * 通用请求方法
 * @param {string} url
 * @param {AxiosRequestConfig} options
 * @returns {Promise<AxiosResponse<any>>}
 */
export default async function request (url, options = {}) {
  const steamApi = 'https://api.steampowered.com'
  const baseURL = options.baseURL ?? steamApi
  return await axios.request({
    url,
    baseURL,
    httpAgent: options.proxy ? new HttpProxyAgent(options.proxy) : undefined,
    httpsAgent: options.proxy ? new HttpsProxyAgent(options.proxy) : undefined,
    ...options,
    params: {
      key: options.apiKey,
      l: 'schinese',
      cc: 'CN',
      language: 'schinese',
      ...options.params
    },
    timeout: (options.timeout || 30) * 1000
  })
}

/**
 * get 请求方法
 * @param {string} url
 * @param {AxiosRequestConfig} options
 * @returns {Promise<AxiosResponse<any>>}
 */
export async function get (url, options = {}) {
  return await request(url, {
    ...options,
    method: 'GET'
  })
}

/**
 * post 请求方法
 * @param {string} url
 * @param {AxiosRequestConfig} options
 * @returns {Promise<AxiosResponse<any>>}
 */
export async function post (url, options = {}) {
  return await request(url, {
    ...options,
    method: 'POST'
  })
}
