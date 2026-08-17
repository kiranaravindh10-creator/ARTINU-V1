# Running Curate

Two commands. No accounts, no keys, no database to set up.

---

## 1. Install Node

You need **Node 20.11 or newer** — **Node 22** is recommended. Check what you have:

```
node -v
```

If that prints nothing, or a number below `v20.11`, install the **LTS** build from
<https://nodejs.org> and reopen your terminal. The installer replaces any older version.

## 2. Open the project folder

Unzip it, then open **the folder that contains this file** in VS Code
(`File → Open Folder…`). Not a folder above it, not `client` or `server` inside it.

## 3. Run it

In the VS Code terminal (`` Ctrl+` ``, or `Terminal → New Terminal`):

```
npm install
npm run dev
```

The first command takes a minute or two. The second prints two addresses — open the
first one:

```
client   http://localhost:5173     ← open this
server   http://localhost:4000
```

That is the whole setup.

> In VS Code you can also press **Ctrl+Shift+B** instead of typing `npm run dev`.

---

## Signing in

The app seeds itself with demo data on first run. Any of these work:

| Who                | Email                            | Password           |
| ------------------ | -------------------------------- | ------------------ |
| Space owner        | `restaurant.demo@curate.ac.in`   | `Curate@Rest2026`  |
| Photographer       | `photographer.demo@curate.ac.in` | `Curate@Photo2026` |
| CEO (full console) | `ceo@curate.ac.in`               | `Curate@CEO2026`   |
| Manager            | `manager@curate.ac.in`           | `Curate@Mgr2026`   |
| Accounts           | `accounts@curate.ac.in`          | `Curate@Acc2026`   |
| Field operations   | `fieldops@curate.ac.in`          | `Curate@Ops2026`   |
| IT                 | `it@curate.ac.in`                | `Curate@IT2026`    |

You can also sign up as a new space owner or photographer from the site itself.

---

## If it does not start

Run this first — it checks the usual causes and tells you which one it is:

```
npm run doctor
```

Otherwise:

**"The app didn't start" in the browser**
You opened `index.html` from the folder instead of the address the terminal printed.
Go back to `http://localhost:5173`.

**`'npm' is not recognized`**
Node is not installed, or the terminal was open before you installed it. Close every
terminal and reopen VS Code.

**`Port 4000 is already in use`**
An earlier copy is still running. The error message prints the exact command to free it
for your operating system.

**`Cannot find module 'vite'`**
`npm install` has not finished, or it was run inside `client/` or `server/`. Run it again
from this folder.

**Anything else, or a half-finished install**

```
npm run clean
npm install
npm run dev
```

---

## What it is doing on your machine

With no `.env` file — which is the default, and how this copy ships — everything runs
locally:

- **Data** lives in the API's memory and is written to `.data/` so restarts keep it. There
  is no external database and nothing leaves your machine.
- **Uploads** are written to `server/uploads/`.
- **Email** is not sent anywhere. Every message the app would send is captured and readable
  in the console under **System → Email log**.
- **Payments** use a mock UPI QR code. Nothing is charged. On the payment screen a
  **Simulate successful payment** button appears so you can complete an order.

Photographs in the demo data load from the internet, so the gallery looks empty offline.
Everything else works without a connection.

To point it at a real Supabase project, SMTP server or payment provider, copy
`.env.example` to `.env` and fill in what you need. Anything you leave blank keeps its
local behaviour.

---

## Commands

| Command             | What it does                                     |
| ------------------- | ------------------------------------------------ |
| `npm install`       | Installs everything. Run once.                   |
| `npm run dev`       | Starts the API and the site together.            |
| `npm run doctor`    | Checks your setup and explains what is missing.   |
| `npm run build`     | Type-checks everything and builds the site.       |
| `npm run typecheck` | Type-checks without building.                     |
| `npm run seed`      | Resets the demo data.                             |
| `npm run clean`     | Deletes every `node_modules`. Reinstall after.    |
| `npm run package`   | Builds a shareable zip with no secrets in it.     |
