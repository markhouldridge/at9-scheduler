# at9-scheduler

Background scheduler service for at9. Consumes RabbitMQ topic messages
and dispatches them to external services. Today it handles transactional
email via [Brevo](https://www.brevo.com) (SMTP relay); the layout is
intentionally generic so additional topics (SMS, push, webhooks…) drop in
alongside without restructuring.

Runs on the **same host as RabbitMQ** to keep the broker round-trip local —
it reaches the broker over `localhost` with the shared `AT9_USER` /
`AT9_PASSWORD` credentials.

## How it fits

```
  webservice / app  ──publish──▶  RabbitMQ  ──consume──▶  scheduler  ──▶  Brevo / …
                                  (at9.events)
```

`webservice` (and anything else) publishes to the topic exchange
`at9.events`. Each scheduler queue is bound to a routing-key pattern and
processes those messages independently — adding a new concern is one
new queue + one new handler.

## Layout

```
scheduler/
├── package.json
├── pm2.config.js             # PM2 process definition (used by the deploy)
├── README.md
├── .env.example
├── .github/workflows/
│   └── deploy.yml            # deploys to the RabbitMQ VPS on push to master
└── src/
    ├── index.js              # boot: registers consumers, wires signals
    ├── config.js             # env loader/validator
    ├── logger.js             # tiny JSON-line logger
    ├── queue/
    │   ├── connection.js     # reconnecting RabbitMQ bus
    │   ├── consumer.js       # generic registerConsumer(...)
    │   └── errors.js         # PermanentError
    ├── services/
    │   └── brevo.js          # Brevo SMTP wrapper (nodemailer)
    └── handlers/
        └── email.js          # consumes email.* — sends via Brevo
```

Each handler is just a function `(payload, ctx) => Promise<void>`. Throw
`PermanentError` (from `queue/errors`) for messages that can never
succeed; anything else is treated as transient and requeued once.

## Setup

```bash
cd scheduler
cp .env.example .env   # fill in the Brevo SMTP + RabbitMQ credentials
npm install
npm start
```

Required env vars:

| Var | Required | Default | Notes |
|---|---|---|---|
| `RABBITMQ_URL` | – | – | full AMQP URL; wins over the discrete parts when set |
| `RABBITMQ_HOST` | – | `localhost` | broker host (scheduler runs on the broker) |
| `RABBITMQ_PORT` | – | `5672` | non-TLS AMQP |
| `RABBITMQ_VHOST` | – | `/` | virtual host |
| `AT9_USER` | – | – | RabbitMQ username (shared with webservice) |
| `AT9_PASSWORD` | – | – | RabbitMQ password (shared with webservice) |
| `RABBITMQ_EXCHANGE` | – | `at9.events` | topic exchange producers publish to |
| `BREVO_SMTP_HOST` | – | `smtp-relay.brevo.com` | Brevo SMTP relay host |
| `BREVO_SMTP_PORT` | – | `587` | STARTTLS |
| `BREVO_SMTP_USER` | ✅ | – | Brevo SMTP login |
| `BREVO_SMTP_PASSWORD` | ✅ | – | Brevo SMTP key |
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
restart doesn't drop it before the scheduler consumes it.

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
  immediately. There's no DLQ wired yet — failures land in the scheduler
  log.
- **Graceful shutdown**: `SIGINT` / `SIGTERM` close the channel and
  connection before exit so in-flight messages settle.

## Deployment

Pushing to `master` triggers `.github/workflows/deploy.yml`, which mirrors
the webservice deploy: it SSHes into the RabbitMQ VPS, writes `.env` from
GitHub secrets, rsyncs the code to `/opt/at9/scheduler`, runs `npm ci`, and
(re)starts the process under PM2 using `pm2.config.js` (app name
`at9-scheduler`).

Required GitHub secrets:

| Secret | Purpose |
|---|---|
| `AT9_VPS_QUEUE` | RabbitMQ server host / external IP |
| `AT9_VPS_QUEUE_SSH_KEY` | SSH private key for the deploy user |
| `AT9_USER` | SSH login user (`at9`), also the RabbitMQ username written into `.env` |
| `AT9_PASSWORD` | RabbitMQ password written into `.env` |

The Brevo SMTP credentials are set in the deploy workflow.

## Local testing without producers

You can publish a test email straight from `rabbitmqctl` or the
RabbitMQ management UI — point the routing key at `email.test` and the
body at the JSON example above.

Or, with `amqplib` installed globally:

```bash
node -e "const a=require('amqplib');(async()=>{const c=await a.connect(process.env.RABBITMQ_URL);const ch=await c.createChannel();await ch.assertExchange('at9.events','topic',{durable:true});ch.publish('at9.events','email.test',Buffer.from(JSON.stringify({to:'you@example.com',subject:'Test',text:'Hello'})),{contentType:'application/json',persistent:true});await ch.close();await c.close();})()"
```
