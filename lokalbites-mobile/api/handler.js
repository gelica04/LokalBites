'use strict';

const { handleApi } = require('../server');

module.exports = (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/handler') {
    const route = url.searchParams.get('__lokalbites_path');
    if (route) url.pathname = '/api/' + route;
  }
  return handleApi(req, res, url);
};
