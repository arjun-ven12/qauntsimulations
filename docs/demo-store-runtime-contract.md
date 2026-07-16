# Demo-store runtime contract

The Phase 1 checkout fixture is a same-origin React application and in-memory HTTP API. Local Vite
development and the production Node server use the same API handler and state implementation.

## Local contract

- Demo-store base URL: `http://localhost:5174`
- API base URL: `http://localhost:5174`
- Start route: `/products/test-product`
- Payment endpoint pattern: `POST **/api/payments`
- Order endpoint pattern: `POST **/api/orders`
- Reset endpoint: `POST /api/test/reset`
- Configuration endpoint: `POST /api/test/config`
- Duplicate-submission feature flag: `duplicateSubmissionBug`
- Artificial latency field: `paymentDelayMs`

Vite binds port `5174` with `strictPort: true`; it fails rather than selecting another port.
`paymentDelayMs` must be an integer from 0 through 10,000. Configuration applies to subsequent
checkout requests without an application restart.

## Remote deployment

- Deployment status: **PUBLIC DEPLOYMENT PENDING**
- Demo-store URL: pending
- API URL: pending
- Intended topology: one same-origin Node service
- Daytona accessibility: not yet verified; localhost is not evidence of sandbox accessibility
- Local production verification date: 2026-07-15
- Fresh-browser verification: passed against Vite and the production Node server
- CORS status: not required for the same-origin topology; API `OPTIONS` returns 204 and never the SPA
- State isolation: one global in-memory fixture per server process; simultaneous workers are not isolated

The production server binds `0.0.0.0`, uses `PORT` (default `4174`), serves `dist`, supports direct
SPA navigation, and handles `/api` before the SPA fallback. A static-only Vite deployment is not
compatible because it would omit the HTTP API.

## Checkout journey selectors

1. Product page: `[data-testid="product-page"]`
2. Add to cart: `[data-testid="add-to-cart"]`
3. Open cart: `[data-testid="open-cart"]`
4. Cart item: `[data-testid="cart-item"]`
5. Checkout: `[data-testid="checkout-button"]`
6. Checkout form: `[data-testid="checkout-form"]`
7. Email input: `[data-testid="email-input"]`
8. Pay: `[data-testid="pay-button"]`
9. Payment status: `[data-testid="payment-status"]`
10. Success confirmation: `[data-testid="order-confirmation"]`
11. Returned order ID: `[data-testid="order-id"]`

The success confirmation is mounted only after both the payment and order requests succeed.

## Deterministic modes

Healthy configuration:

```json
{ "duplicateSubmissionBug": false, "paymentDelayMs": 0 }
```

Expected result, including a second click approximately 50 ms into a delayed request:

```json
{ "paymentRequests": 1, "ordersCreated": 1, "confirmationVisible": true }
```

Buggy delayed configuration:

```json
{ "duplicateSubmissionBug": true, "paymentDelayMs": 1200 }
```

Expected result after clicks approximately 50 ms apart:

```json
{ "paymentRequests": 2, "ordersCreated": 2, "confirmationVisible": true }
```

`POST /api/test/reset` restores the cart, checkout, payments, orders, inventory, fault
configuration, request counters, and generated ID counters. It invalidates delayed payment work
from the prior fixture generation and returns:

```json
{ "ok": true, "resetAt": "<ISO timestamp>" }
```
