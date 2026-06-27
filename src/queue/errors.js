'use strict';

// Thrown from a handler when the message can never succeed — invalid
// payload, unsupported recipient, etc. The consumer nacks without
// requeueing so the message doesn't loop. Anything else thrown is
// treated as transient and the message is requeued once.
class PermanentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermanentError';
  }
}

module.exports = { PermanentError };
