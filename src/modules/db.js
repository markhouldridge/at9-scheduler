'use strict';

const { Pool } = require('pg');
const { db } = require('../config');

// Shared Postgres pool. Mirrors the webservice connection
// (webservice/src/modules/db.js) but pulls the password from the
// environment rather than committing it. A small pool is plenty — the
// scheduler processes one message at a time (prefetch 1).
const pool = new Pool({
  host: db.host,
  port: db.port,
  user: db.user,
  database: db.database,
  password: db.password,
  max: 4,
  idleTimeoutMillis: 30_000,
});

module.exports = pool;
