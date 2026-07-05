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
                                  (bookings)
```

`webservice` publishes booking lifecycle events to the durable topic
exchange `bookings` (see `webservice/src/modules/queue.js`); they land in
the durable `booking-messages` queue. The scheduler binds that queue to
`booking.#` and processes each event. Adding a new concern is one new
queue + one new handler — the exchange/queue/topics here are kept in sync
with the webservice publisher.

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
    ├── modules/
    │   └── db.js             # shared Postgres pool
    ├── queue/
    │   ├── connection.js     # reconnecting RabbitMQ bus
    │   ├── consumer.js       # generic registerConsumer(...)
    │   └── errors.js         # PermanentError
    ├── services/
    │   ├── brevo.js          # Brevo SMTP wrapper (nodemailer)
    │   └── bookingRepo.js    # reads customer + booking detail for emails
    └── handlers/
        ├── booking.js        # consumes booking.# — looks up + emails the customer
        └── email.js          # Brevo email payload handler (reserved)
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
| `RABBITMQ_HOST` | – | `87.106.102.51` | broker host (deploy sets `localhost` — scheduler runs on the broker) |
| `RABBITMQ_PORT` | – | `5672` | non-TLS AMQP |
| `RABBITMQ_VHOST` | – | `/` | virtual host |
| `AT9_USER` | – | – | RabbitMQ username (shared with webservice) |
| `AT9_PASSWORD` | – | – | RabbitMQ password (shared with webservice) |
| `RABBITMQ_BOOKINGS_EXCHANGE` | – | `bookings` | topic exchange the webservice publishes to |
| `RABBITMQ_BOOKINGS_QUEUE` | – | `booking-messages` | durable queue bound to `booking.#` |
| `DB_HOST` | – | `db1.at9.app` | Postgres host (shared with webservice) |
| `DB_PORT` | – | `5432` | Postgres port |
| `DB_USER` | – | `postgres` | Postgres user |
| `DB_NAME` | – | `at9` | Postgres database |
| `DB_PASSWORD` | ✅ | – | Postgres password |
| `BREVO_SMTP_HOST` | – | `smtp-relay.brevo.com` | Brevo SMTP relay host |
| `BREVO_SMTP_PORT` | – | `587` | STARTTLS |
| `BREVO_SMTP_USER` | ✅ | – | Brevo SMTP login |
| `BREVO_SMTP_PASSWORD` | ✅ | – | Brevo SMTP key |
| `EMAIL_FROM` | – | `At9 <noreply@at9.app>` | default `From:` — per-message `from` overrides |
| `LOG_LEVEL` | – | `info` | `debug` / `info` / `warn` / `error` |

`npm run dev` boots with `--watch` for local iteration.

## Topics

### `booking.#`

Queue: `booking-messages` — binding: `booking.#` on the `bookings`
exchange. Matches the webservice publisher exactly, so the scheduler
receives every `booking.created` / `booking.updated` / `booking.cancelled`
event. The routing key is included in the `booking.event` log line.

Payload (JSON, UTF-8) — metadata stamped by the publisher (see the `*Meta`
objects in `webservice/src/routes/*.js`):

```jsonc
{
  "event":              "booking.created", // | booking.updated | booking.cancelled
  "source":             "provider",        // provider | public | self
  "organisationId":     "org_123",
  "entityType":         "room",
  "entityIds":          ["ent_1"],
  "bookingIds":         ["bk_1"],
  "reservationGroupId": "grp_1",           // optional
  "customerId":         "cus_1",           // optional
  "publishedAt":        "2026-07-05T…Z"    // stamped by the publisher
}
```

These events carry **no** recipient address, so the handler reads the
customer email + booking reference from Postgres (`services/bookingRepo.js`,
keyed by `bookingIds`) and sends via Brevo (`services/brevo.js`):

- `booking.created` → **confirmation** email to the customer
- `booking.cancelled` → **cancellation** email to the customer
- `booking.updated` → logged and skipped (no email yet)

A booking with no customer email on file is dropped (`PermanentError`) —
retrying can't help. Email copy is a first pass; templates and provider
notifications aren't wired yet.

The webservice publishes these after the DB commit — see
`webservice/src/modules/queue.js`. `persistent: true` keeps each message on
disk so an unexpected broker restart doesn't drop it before the scheduler
consumes it.

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

The Brevo SMTP credentials and the Postgres password are set in the deploy
workflow.

## Local testing without producers

You can publish a test booking event straight from `rabbitmqctl` or the
RabbitMQ management UI — publish to the `bookings` exchange with a routing
key like `booking.created` and the JSON body above.

Or, with `amqplib` installed globally:

```bash
node -e "const a=require('amqplib');(async()=>{const c=await a.connect(process.env.RABBITMQ_URL);const ch=await c.createChannel();await ch.assertExchange('bookings','topic',{durable:true});ch.publish('bookings','booking.created',Buffer.from(JSON.stringify({event:'booking.created',organisationId:'org_test',bookingIds:['bk_test']})),{contentType:'application/json',persistent:true});await ch.close();await c.close();})()"
```
