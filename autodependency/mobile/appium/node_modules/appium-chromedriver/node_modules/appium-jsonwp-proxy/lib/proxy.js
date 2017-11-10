import _ from 'lodash';
import { request as mockRequest } from '../test/mock-request';
import { default as log } from 'appium-logger';
import realRequest from 'request';
import jwpStatus from 'jsonwp-status';
import Q from 'q';

function truncate (json, chars = 200) {
  json = json || "";
  if (typeof json !== "string") {
    json = JSON.stringify(json);
  }
  const ext = json.length > chars ? '...' : '';
  return json.slice(0, chars) + ext;
}

function safeJson (body) {
  try {
    body = JSON.parse(body);
  } catch (e) {}
  return body;
}

class JWProxy {
  constructor (opts = {}) {
    Object.assign(this, {
      scheme: 'http',
      server: 'localhost',
      port: 4444,
      base: '/wd/hub',
      sessionId: null,
      mockRequest: false
    }, opts);
    this.scheme = this.scheme.toLowerCase();
  }

  request (...args) {
    if (this.mockRequest) {
      return mockRequest(...args);
    } else {
      return realRequest(...args);
    }
  }

  endpointRequiresSessionId (endpoint) {
    return !_.contains(["/session", "/sessions", "/status"], endpoint);
  }

  getUrlForProxy (url) {
    if (url === "") url = "/";
    const proxyBase = `${this.scheme}://${this.server}:${this.port}${this.base}`;
    const endpointRe = '(/(session|status))';
    let rest = "";
    if (/^http/.test(url)) {
      const first = (new RegExp('(https?://.+)' + endpointRe)).exec(url);
      if (!first) {
        throw new Error("Got a complete url but could not extract JWP endpoint");
      }
      rest = url.replace(first[1], '');
    } else if ((new RegExp('^/')).test(url)) {
      rest = url;
    } else {
      throw new Error("Didn't know what to do with url '" + url + "'");
    }
    const requiresSessionId = this.endpointRequiresSessionId(rest);

    if (requiresSessionId && this.sessionId === null) {
      throw new Error("Trying to proxy a session command without session id");
    }

    const stripPrefixRe = new RegExp('^.+(/(session|status).*)$');
    if (stripPrefixRe.test(rest)) {
      rest = stripPrefixRe.exec(rest)[1];
    }

    if (!(new RegExp(endpointRe)).test(rest)) {
      rest = `/session/${this.sessionId}${rest}`;
    }

    const sessionBaseRe = new RegExp('^/session/([^/]+)');
    if (sessionBaseRe.test(rest)) {
      // we have something like /session/:id/foobar, so we need to replace
      // the session id
      const match = sessionBaseRe.exec(rest);
      rest = rest.replace(match[1], this.sessionId);
    } else if (requiresSessionId) {
      throw new Error("Got bad session base with rest of url: " + rest);
    }
    rest = rest.replace(/\/$/, ''); // can't have trailing slashes
    return proxyBase + rest;
  }

  async proxy (url, method, body = null) {
    method = method.toUpperCase();
    const newUrl = this.getUrlForProxy(url);
    const reqOpts = {
      url: this.getUrlForProxy(url),
      method,
      headers: {'Content-type': 'application/json;charset=UTF=8'}
    };
    if (body !== null) {
      if (typeof body !== 'object') {
        body = JSON.parse(body);
      }
      reqOpts.json = body;
    }
    log.info(`Proxying [${method} ${url || "/"}] to [${method} ${newUrl}]` +
             (body ? ` with body: ${truncate(body)}` : ' with no body'));
    let res, resBody;
    try {
      [res, resBody] = await Q.ninvoke(this, 'request', reqOpts);
      log.info(`Got response with status ${res.statusCode}: ${truncate(resBody)}`);
      if (/\/session$/.test(url) && method === "POST") {
        if (res.statusCode === 200) {
          this.sessionId = resBody.sessionId;
        } else if (res.statusCode === 303) {
          this.sessionId = /\/session\/([^\/]+)/.exec(resBody)[1];
        }
      }
    } catch (e) {
      throw new Error("Could not proxy command to remote server. " +
                      `Original error: ${e.message}`);
    }
    return [res, resBody];
  }

  async command (url, method, body = null) {
    let [response, resBody] = await this.proxy(url, method, body);
    let statusCodesWithRes = [100, 200, 500];
    resBody = safeJson(resBody);
    if (_.contains(statusCodesWithRes, response.statusCode) &&
        (_.isUndefined(resBody.status) || _.isUndefined(resBody.value))) {
      throw new Error("Did not get a valid response object. Object was: " +
                      JSON.stringify(resBody));
    }
    if (_.contains(statusCodesWithRes, response.statusCode)) {
      if (response.statusCode === 200 && resBody.status === 0) {
        return resBody.value;
      } else if (response.statusCode === 200 && _.isUndefined(resBody.status)) {
        return resBody;
      }
      let message = jwpStatus.getSummaryByCode(resBody.status);
      if (resBody.value.message) {
        message += ` (Original error: ${resBody.value.message})`;
      }
      let e = new Error(message);
      e.status = resBody.status;
      e.value = resBody.value;
      e.httpCode = response.statusCode;
      throw e;
    }
    throw new Error(`Didn't know what to do with response code ${response.statusCode}`);
  }

  async proxyReqRes (req, res) {
    let [response, body] = await this.proxy(req.originalUrl, req.method, req.body);
    res.headers = response.headers;
    res.set('Content-type', response.headers['content-type']);
    // if the proxied response contains a sessionId that the downstream
    // driver has generated, we don't want to return that to the client.
    // Instead, return the id for the current session
    body = safeJson(body);
    if (body && body.sessionId && this.sessionId) {
      body.sessionId = this.sessionId;
    }
    res.status(response.statusCode).send(JSON.stringify(body));
  }
}

export default JWProxy;
