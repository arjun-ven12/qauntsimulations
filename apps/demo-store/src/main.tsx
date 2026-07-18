import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { BrowserRouter } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import type { DemoConfig, OrderRecord, PaymentRecord } from './demo-api.js';
import './styles.css';

const PRODUCT = { name: 'Rift Test Product', price: 12_900, currency: 'SGD' };

function Layout() {
  const [cartItems, setCartItems] = useState(0);
  return (
    <>
      <header className="top">
        <Link className="brand" to="/products/test-product">
          NORTHSTAR GOODS
        </Link>
        <Link aria-label="Open cart" className="cart-link" data-testid="open-cart" to="/cart">
          <ShoppingBag aria-hidden="true" /> <span>{cartItems}</span>
        </Link>
      </header>
      <main className="shell">
        <Routes>
          <Route path="/" element={<Product onAdd={() => setCartItems(1)} />} />
          <Route
            path="/products/test-product"
            element={<Product onAdd={() => setCartItems(1)} />}
          />
          <Route path="/cart" element={<Cart hasItem={cartItems > 0} />} />
          <Route path="/checkout" element={<Checkout onOrdered={() => setCartItems(0)} />} />
          <Route path="/orders/:id" element={<Confirmation />} />
        </Routes>
      </main>
    </>
  );
}

function Product({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="product" data-testid="product-page">
      <div aria-label="Rift test product" className="photo">
        ◒
      </div>
      <div>
        <div className="kicker">Deterministic demo fixture</div>
        <h1>{PRODUCT.name}</h1>
        <p className="muted">A seeded product for repeatable Rift checkout investigations.</p>
        <p className="price">S$129.00</p>
        <p>5 in stock</p>
        <button className="primary" data-testid="add-to-cart" onClick={onAdd} type="button">
          Add to cart
        </button>
      </div>
    </section>
  );
}

function Cart({ hasItem }: { hasItem: boolean }) {
  return (
    <section className="card">
      <h1>Your cart</h1>
      {hasItem ? (
        <>
          <div className="row" data-testid="cart-item">
            <span>{PRODUCT.name} × 1</span>
            <strong>S$129.00</strong>
          </div>
          <hr />
          <div className="row">
            <strong>Total</strong>
            <strong>S$129.00</strong>
          </div>
          <Link to="/checkout">
            <button className="primary cart-action" data-testid="checkout-button" type="button">
              Checkout securely
            </button>
          </Link>
        </>
      ) : (
        <p className="muted">Your cart is empty.</p>
      )}
    </section>
  );
}

function Checkout({ onOrdered }: { onOrdered: () => void }) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<DemoConfig>({
    duplicateSubmissionBug: false,
    paymentDelayMs: 0,
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Ready to pay');
  const submissionInFlight = useRef(false);
  const attempt = useRef(0);

  useEffect(() => {
    void fetch('/api/test/config')
      .then(async (response) => (response.ok ? ((await response.json()) as DemoConfig) : null))
      .then((activeConfig) => {
        if (activeConfig) setConfig(activeConfig);
      });
  }, []);

  async function pay(): Promise<void> {
    if (!config.duplicateSubmissionBug && submissionInFlight.current) return;
    submissionInFlight.current = true;
    attempt.current += 1;
    setBusy(true);
    setStatus('Processing payment…');

    const idempotencyKey = config.duplicateSubmissionBug
      ? `checkout_attempt_${String(attempt.current).padStart(3, '0')}`
      : 'checkout_attempt_001';

    try {
      const paymentResponse = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartId: 'cart_demo_001',
          amount: PRODUCT.price,
          currency: PRODUCT.currency,
          idempotencyKey,
        }),
      });
      if (!paymentResponse.ok) throw new Error('Payment failed');
      const payment = (await paymentResponse.json()) as PaymentRecord;
      const orderResponse = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: payment.paymentId }),
      });
      if (!orderResponse.ok) throw new Error('Order creation failed');
      const order = (await orderResponse.json()) as OrderRecord;
      setStatus('Payment succeeded');
      onOrdered();
      navigate(`/orders/${order.orderId}`);
    } catch {
      setStatus('Payment could not be completed.');
    } finally {
      if (!config.duplicateSubmissionBug) submissionInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <form
      className="card"
      data-testid="checkout-form"
      onSubmit={(event) => {
        event.preventDefault();
        void pay();
      }}
    >
      <div className="kicker">Secure demo checkout</div>
      <h1>Contact & payment</h1>
      <label className="field">
        Email
        <input data-testid="email-input" defaultValue="test@taskos.dev" required type="email" />
      </label>
      <p className="muted">Demo payment only. No real payment method is charged.</p>
      <p aria-live="polite" data-testid="payment-status">
        {status}
      </p>
      <button
        className="primary"
        data-testid="pay-button"
        disabled={busy && !config.duplicateSubmissionBug}
        type="submit"
      >
        {busy ? 'Processing…' : 'Pay S$129.00'}
      </button>
    </form>
  );
}

function Confirmation() {
  const { id = '' } = useParams();
  return (
    <section className="card success" data-testid="order-confirmation">
      <div className="kicker">Order confirmed</div>
      <h1>You're all set.</h1>
      <p>
        Order <strong data-testid="order-id">{id}</strong> is confirmed.
      </p>
      <Link to="/products/test-product">Continue shopping</Link>
    </section>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  </StrictMode>,
);
