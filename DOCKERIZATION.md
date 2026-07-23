# WanderLust Dockerization Guide

## 1. What is being containerized

WanderLust is one Node.js/Express application that renders EJS pages and connects to MongoDB. It also uses:

- MongoDB through Mongoose for application data.
- MongoDB through `connect-mongo` for session storage.
- Cloudinary for uploaded listing images.
- Mapbox for geocoding and browser maps.
- Port `8080` inside the application container.

The Docker Compose stack contains two services:

1. `app`: the Node.js application.
2. `mongo`: a local MongoDB database with a named volume.

Cloudinary and Mapbox remain external managed services; they are configured through environment variables and are not containerized.

## 2. Files added or changed

### `Dockerfile`

- Uses `node:24.5.0-alpine`, matching the Node version recorded in the original lock file.
- Installs exact production dependencies using `npm ci --omit=dev`.
- Uses a two-stage build so npm cache and installation tools do not unnecessarily enlarge the runtime layer.
- Runs as the non-root `node` user.
- Exposes container port `8080`.
- Adds an HTTP health check against `/health`.

### `.dockerignore`

Prevents secrets, local dependencies, Git history, editor files, and documentation from being copied into the Docker build context/image.

### `compose.yaml`

- Builds the application image.
- Starts MongoDB 8 with authentication.
- Persists MongoDB data in the `mongo_data` named volume.
- Waits for MongoDB's health check before starting the application.
- Passes the MongoDB service hostname `mongo` in `ATLASDB_URL`.
- Maps host `${APP_PORT}` to container port `8080`.

### `.env.example`

Documents all required settings without containing real secrets.

### `app.js`

- Reads `PORT` and `HOST` from the environment.
- Fails fast if `ATLASDB_URL` or `SECRET` is missing.
- Connects to MongoDB before listening for HTTP traffic.
- Adds `/health` for Docker health checks.
- Adds graceful `SIGTERM` and `SIGINT` shutdown.
- Fixes the Mongo session-store error callback.
- Uses `saveUninitialized: false` and configurable secure cookies.

### `init/index.js`

The original seed script used `127.0.0.1`, which is incorrect inside the app container, and inserted listings without required `geometry`. The updated seed script:

- Uses `ATLASDB_URL`.
- Creates or reuses a seed user.
- Geocodes each sample listing with Mapbox.
- Inserts valid listings with an owner and GeoJSON geometry.

## 3. Required prerequisites

Install Docker Desktop, Docker Engine with the Compose plugin, or another compatible Docker/Compose environment.

Create accounts/credentials for:

- Mapbox: public access token.
- Cloudinary: cloud name, API key, and API secret.

## 4. Configure the environment

From the project root:

```bash
cp .env.example .env
```

Edit `.env` and replace all placeholder values. Generate a session secret, for example:

```bash
openssl rand -base64 48
```

Do not commit `.env`.

## 5. Build and start

```bash
docker compose up --build -d
```

Check status:

```bash
docker compose ps
```

Follow application logs:

```bash
docker compose logs -f app
```

Open:

```text
http://localhost:8080
```

The root URL redirects to `/listings`.

## 6. Seed the database (optional)

The application can run with an empty database. To insert the included sample listings:

```bash
docker compose run --rm app npm run seed
```

This calls Mapbox once per sample location, so a valid `MAP_TOKEN` is mandatory. Seed login credentials come from `SEED_USERNAME` and `SEED_PASSWORD` in `.env`.

## 7. Useful lifecycle commands

Stop containers without deleting data:

```bash
docker compose down
```

Stop containers and delete the MongoDB volume/data:

```bash
docker compose down -v
```

Rebuild after dependency or Dockerfile changes:

```bash
docker compose build --no-cache app
docker compose up -d
```

Run a shell in the application container:

```bash
docker compose exec app sh
```

Inspect application health manually:

```bash
curl http://localhost:8080/health
```

## 8. Why `mongo` is used instead of `localhost`

Each Compose service has its own network namespace. Inside the `app` container, `localhost` means the `app` container itself. Compose provides internal DNS, so MongoDB is reached by the service name `mongo` on port `27017`:

```text
mongodb://username:password@mongo:27017/wanderlust?authSource=admin
```

## 9. Using MongoDB Atlas instead of the MongoDB container

The Docker image does not depend on the local MongoDB service. To run only the app against Atlas, set `ATLASDB_URL` to the Atlas connection string and run:

```bash
docker build -t wanderlust:latest .
docker run --rm \
  --name wanderlust \
  --env-file .env \
  -e NODE_ENV=production \
  -e PORT=8080 \
  -p 8080:8080 \
  wanderlust:latest
```

In this mode, ensure `.env` contains the Atlas URL. Never bake the URL or credentials into the image.

## 10. Production deployment notes

- Put the container behind an HTTPS reverse proxy or managed load balancer.
- Set `COOKIE_SECURE=true` only when requests arrive over HTTPS and proxy headers are forwarded.
- Use a managed MongoDB service or a properly secured production MongoDB deployment; the Compose database is intended primarily for local development and assessment demonstrations.
- Store secrets in the deployment platform's secret manager, not in Git or the Docker image.
- Restrict the Cloudinary upload preset/account and rotate exposed credentials.
- Use a Mapbox token with the minimum scopes and URL restrictions suitable for the deployment.
- Pin image versions and update them intentionally.
- Add automated tests before using the image in CI/CD; the original project contains no real test suite.

## 11. Expected architecture

```text
Browser
   |
   | HTTP :8080
   v
WanderLust app container
   |-- EJS/static files
   |-- Passport/session middleware
   |-- Mapbox API (outbound HTTPS)
   |-- Cloudinary API (outbound HTTPS)
   |
   | mongodb://mongo:27017
   v
MongoDB container
   |
   v
mongo_data named volume
```

## 12. Submission checklist

- `Dockerfile` builds the Node.js image.
- `.dockerignore` excludes secrets and unnecessary files.
- `compose.yaml` starts both the app and MongoDB.
- `.env.example` lists configuration keys without real secrets.
- The app listens on `0.0.0.0:8080`.
- The MongoDB connection uses `mongo`, not `localhost`.
- Data survives restarts through `mongo_data`.
- The container runs as a non-root user.
- `/health` reports database connectivity.
- Secrets are injected at runtime.
- README/implementation guide contains build, run, log, seed, and teardown commands.
