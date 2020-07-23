# Kratos / Architect.io - Proof-of-concept

This repository contains a set of [Ory](https://ory.sh) identity services, namely
[Kratos](https://www.ory.sh/kratos/) and [Hydra](https://www.ory.sh/hydra/), broken up into individual [Architect](https://architect.io) services. The goal of this PoC is to successfully generate a running stack using Architect so that the individual components can be published to Architect's registry to be made available for other apps to consume. There are still a few features Architect needs to work on before the flow can be productionalized (e.g. mounting config files at deploy-time), but for now the local debug flags should enable local environments to work properly.

## Running the stack

### Step 1 - Install the Architect CLI

```sh
$ npm install -g @architect-io/cli
```

### Step 2 - Deploy

```sh
$ architect deploy -l ./environment.yml

# To debug the docker-compose output and write it to a file:
$ architect deploy -l ./environment.yml -o docker-compose.json
```

### Step 3 - Open the oauth client in the browser

[app.localhost](http://app.localhost)

## Configuring Kratos

The Kratos configuration and identity schema can both be found in `./server/kratos/config`.
