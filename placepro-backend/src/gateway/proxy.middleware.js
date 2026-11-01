const http = require("http");
const https = require("https");
const { logger } = require("../utils/logger");

function createProxy(target) {
  const targetUrl = new URL(target);
  const transport = targetUrl.protocol === "https:" ? https : http;

  return (req, res, next) => {
    const upstreamRequest = transport.request(
      {
        protocol: targetUrl.protocol,
        hostname: targetUrl.hostname,
        port: targetUrl.port,
        method: req.method,
        path: req.originalUrl,
        headers: { ...req.headers, host: targetUrl.host },
      },
      (upstreamResponse) => {
        res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
        upstreamResponse.pipe(res);
      }
    );

    upstreamRequest.on("error", (error) => {
      logger.error("proxy.upstream_unavailable", error, {
        requestId: req.requestId,
        method: req.method,
        path: req.originalUrl,
        target: targetUrl.host,
      });
      error.statusCode = 502;
      error.code = "SERVICE_UNAVAILABLE";
      error.message = `Upstream service is unavailable: ${targetUrl.host}`;
      next(error);
    });

    req.pipe(upstreamRequest);
  };
}

module.exports = { createProxy };
