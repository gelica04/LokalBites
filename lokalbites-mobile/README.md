# LokalBites — Farm-to-Market Mobile App

A working **mobile-first full-stack web app / installable PWA** developed from the supplied LokalBites 5-screen HTML prototype. Created for learning and demonstrations.

## What works

- Mobile-responsive home, browsing, searching and category filtering.
- Product catalog loaded from a real Node.js API, seeded with 10 sample produce items.
- Cart with stock checks, quantity adjustment and persistent browser storage.
- Customer registration and login; passwords hashed with scrypt, signed sessions.
- Real order submission with server-side subtotal/delivery/community-fee calculation and inventory deduction.
- Checkout validation, Cash on Delivery / Pay on Pickup, order confirmation and history.
- Farmer login, inventory/price editing, product creation, hide/show, order review, order status transitions and restocking on cancellation.
- Installable progressive web app shell with basic offline static asset cache (API data still requires connection).

## Run in VS Code / Windows

1. Install Node.js 18+.
2. Open the `lokalbites-mobile` folder in VS Code (File → Open Folder).
3. Open Terminal → New Terminal.
4. Run `node server.js` (or `npm start`; if PowerShell blocks npm, use `node server.js` directly).
5. Visit **http://localhost:3000** in Chrome or Edge.
6. To install on supported devices, serve over HTTPS, or use localhost on the same device. In Chrome/Edge use the browser's Install app command.

No `npm install` required: the server uses only built-in Node.js modules.

### Demo accounts

- Customer: **customer@lokalbites.test** / **Customer123!**
- Farmer: **farmer@lokalbites.test** / **Farmer123!**

You can register new customer accounts inside the app. The farmer demo account is pre-seeded. Change demo passwords before deployment.

### Example test run

Run `npm test` while the app is running, or `node tests/smoke.js`. The test uses a separate temporary server/data file and does not alter your main data.

## Project structure

```
lokalbites-mobile/
├── server.js                  Node.js API and static web server
├── public/
│   ├── index.html             App entrypoint
│   ├── styles.css             Responsive mobile UI
│   ├── app.js                 All app screens and interactions
│   ├── manifest.webmanifest   PWA installation metadata
│   ├── icon.svg               App icon
│   └── sw.js                  Static asset offline cache
├── tests/
│   └── smoke.js              End-to-end API smoke test
├── package.json
└── README.md
```

The database file `data.json` is created on first launch and ignored by Git. Delete it to reset demo products/accounts/orders.

## API endpoints

| Method | Path | Access |
|---|---|---|
| GET | `/api/health` | Public |
| GET | `/api/products` | Public |
| POST | `/api/auth/register` | Public |
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Signed in |
| POST | `/api/orders` | Customer |
| GET | `/api/orders` | Customer |
| GET | `/api/farmer/orders` | Farmer |
| GET | `/api/farmer/products` | Farmer |
| PATCH | `/api/farmer/orders/:id/status` | Farmer |
| POST | `/api/farmer/products` | Farmer |
| PATCH | `/api/farmer/products/:id` | Farmer |

## Pricing

- Delivery fee: ₱35, waived for pickup.
- Community support fee: ₱10 per order.
- Server computes all totals and checks stock (the client cannot set item prices).

## What is NOT implemented

This is a **working academic prototype**, not a production commerce platform. No real money is charged; checkout offers COD or pay on pickup only. It does not integrate live GPS, a courier system, SMS, real-time map tracking, verified farms, actual inventory sync, a payment gateway, or real farmer ownership controls. Sample farmer names, catalog items, prices and inventory are illustrative. It is a PWA, **not an Android APK or iOS IPA**. The local JSON file and single-process server are suitable for a demo only; a live launch needs a transactional database, stricter account permissions, HTTPS, secrets management, monitoring, and payment/delivery integrations. Do not expose this development server to the public internet as-is.

## Deployment considerations

Set `APP_SECRET` to a long random secret before any hosted testing, use HTTPS, and use a transactional database instead of the JSON file for concurrent purchases. Password reset and account verification are not present.
