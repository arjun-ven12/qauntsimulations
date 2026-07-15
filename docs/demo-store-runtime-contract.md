# Demo-store runtime contract

The Phase 1 checkout fixture is served by the demo-store Vite development server. Its in-memory
API is mounted on the same origin, so runtime workers should send every API request through
`http://localhost:5174/api/...`. The test-only reset, configuration, and diagnostic routes are not
included in a production build.

## URLs and endpoints

- Demo-store base URL: `http://localhost:5174`
- Start route: `/products/test-product`
- Payment endpoint pattern: `POST **/api/payments`
- Order endpoint pattern: `POST **/api/orders`
- Reset endpoint: `POST /api/test/reset`
- Configuration endpoint: `POST /api/test/config`
- Duplicate-submission feature flag: `duplicateSubmissionBug`
- Artificial latency field: `paymentDelayMs`

The server binds port `5174` with Vite `strictPort: true`; it will fail instead of selecting another
port. `paymentDelayMs` must be a non-negative integer no greater than 10,000. The configuration
applies to subsequent checkout requests without an application restart.

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

Expected result, including after a rapid double-click:

```json
{ "paymentRequests": 1, "ordersCreated": 1, "confirmationVisible": true }
```

Buggy delayed configuration:

```json
{ "duplicateSubmissionBug": true, "paymentDelayMs": 1200 }
```

Expected result after two rapid clicks:

```json
{ "paymentRequests": 2, "ordersCreated": 2, "confirmationVisible": true }
```

`POST /api/test/reset` restores the cart, checkout, payments, orders, inventory, configuration,
request counters, and generated ID counters. It returns `{ "ok": true, "resetAt": "<ISO timestamp>" }`.
