# Modesty is the Name

A browser-based, simultaneous-play word association party game inspired by Codenames. Open source, no monetization. Designed so friends can join from their phones.

See [`DESIGN.md`](./DESIGN.md) for the full spec.

## Run it

```sh
npm install
npm run dev
```

Then open http://localhost:5173 (Vite dev server, proxies websockets to `localhost:3000`).

## Run it for friends (production-ish)

```sh
npm install
npm start
```

In a second terminal, expose it on the public internet via a Cloudflare tunnel:

```sh
npm run tunnel
# or directly: cloudflared tunnel --url http://localhost:3000
```

Share the printed `*.trycloudflare.com` URL with friends.

The server port defaults to `3000`. If that's already in use (e.g. another local dev server), override it: `PORT=3010 npm start` (and adjust the tunnel command accordingly).
