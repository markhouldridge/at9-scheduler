# at9-worker

Background worker service for at9. Consumes RabbitMQ topic messages
and dispatches them to external services. Today it handles transactional
email via [Resend](https://resend.com); the layout is intentionally
generic so additional topics (SMS, push, webhooks…) drop in alongside
without restructuring.

Runs on the same host as RabbitMQ (`queue.at9.app`) for now to keep the
broker round-trip local.

## How it fits

```
  webservice / app  ──publish──▶  RabbitMQ  ──consume──▶  worker  ──▶  Resend / …
                                  (at9.events)
```

`webservice` (and anything else) publishes to the topic exchange
`at9.events`. Each worker queue is bound to a routing-key pattern and
processes those messages independently — adding a new concern is one
new queue + one new handler.

## Layout

```
worker/
├── package.json
├── README.md
├── .env.example
└── src/
    ├── index.js              # boot: registers consumers, wires signals
    ├── config.js             # env loader/validator
    ├── logger.js             # tiny JSON-line logger
    ├── queue/
    │   ├── connection.js     # reconnecting RabbitMQ bus
    │   ├── consumer.js       # generic registerConsumer(...)
    │   └── errors.js         # PermanentError
    ├── services/
    │   └── resend.js         # Resend SDK wrapper
    └── handlers/
        └── email.js          # consumes email.* — sends via Resend
```

Each handler is just a function `(payload, ctx) => Promise<void>`. Throw
`PermanentError` (from `queue/errors`) for messages that can never
succeed; anything else is treated as transient and requeued once.

## Setup

```bash
cd worker
cp .env.example .env   # fill in RESEND_API_KEY and your RABBITMQ_URL
npm install
npm start
```

Required env vars:

| Var | Required | Default | Notes |
|---|---|---|---|
| `RABBITMQ_URL` | – | `amqp://localhost:5672` | full AMQP URL |
| `RABBITMQ_EXCHANGE` | – | `at9.events` | topic exchange producers publish to |
| `RESEND_API_KEY` | ✅ | – | from https://resend.com/api-keys |
| `EMAIL_FROM` | – | `At9 <noreply@at9.app>` | default `From:` — per-message `from` overrides |
| `LOG_LEVEL` | – | `info` | `debug` / `info` / `warn` / `error` |

`npm run dev` boots with `--watch` for local iteration.

## Topics

### `email.*`

Queue: `at9.email` — bindings: `email.*` (e.g. `email.welcome`,
`email.booking.confirmed`). The routing key is included in the
`email.sent` log line so producers can be traced without payload
inspection.

Payload (JSON, UTF-8):

```jsonc
{
  "to":       "user@example.com",   // or ["a@x.com", "b@x.com"]
  "from":     "Acme <hi@acme.com>", // optional — falls back to EMAIL_FROM
  "replyTo":  "support@acme.com",   // optional
  "subject":  "Welcome to Acme",
  "html":     "<p>…</p>",           // either html or text required
  "text":     "Plain version…"
}
```

Publish example (Node, using `amqplib`):

```js
const amqp = require('amqplib');

const conn = await amqp.connect(process.env.RABBITMQ_URL);
const ch = await conn.createChannel();
await ch.assertExchange('at9.events', 'topic', { durable: true });

ch.publish(
  'at9.events',
  'email.booking.confirmed',
  Buffer.from(JSON.stringify({
    to: 'mark@example.com',
    subject: 'Your booking is confirmed',
    html: '<p>See you on Friday.</p>',
  })),
  { contentType: 'application/json', persistent: true },
);

await ch.close();
await conn.close();
```

`persistent: true` keeps the message on disk so an unexpected broker
restart doesn't drop it before the worker consumes it.

## Adding a new topic

1. Write a handler in `src/handlers/<topic>.js` exporting
   `handle(payload, ctx)`.
2. Register it in `src/index.js`:

   ```js
   const sms = require('./handlers/sms');

   registerConsumer(bus, {
     queue: 'at9.sms',
     bindings: ['sms.*'],
     handler: sms.handle,
   });
   ```

That's it — the connection, prefetch, ack/nack and retry behaviour are
all shared.

## Reliability notes

- **Reconnect**: the bus retries with exponential back-off (capped at
  30 s) on connection close or error.
- **Prefetch 1**: each consumer takes one message at a time so a slow
  handler can't be flooded.
- **Retry once**: transient handler errors `nack(requeue=true)` on the
  first delivery, then drop on the retry. `PermanentError` drops
  immediately. There's no DLQ wired yet — failures land in the worker
  log.
- **Graceful shutdown**: `SIGINT` / `SIGTERM` close the channel and
  connection before exit so in-flight messages settle.

## Deployment

Same server as the rest of the stack. Recommended PM2 entry:

```bash
pm2 start src/index.js --name at9-worker --time
```

The webservice already runs under PM2; keeping the worker there gives
you a single dashboard for logs, restarts, and memory.

## Local testing without producers

You can publish a test email straight from `rabbitmqctl` or the
RabbitMQ management UI — point the routing key at `email.test` and the
body at the JSON example above.

Or, with `amqplib` installed globally:

```bash
node -e "const a=require('amqplib');(async()=>{const c=await a.connect(process.env.RABBITMQ_URL);const ch=await c.createChannel();await ch.assertExchange('at9.events','topic',{durable:true});ch.publish('at9.events','email.test',Buffer.from(JSON.stringify({to:'you@example.com',subject:'Test',text:'Hello'})),{contentType:'application/json',persistent:true});await ch.close();await c.close();})()"
```
