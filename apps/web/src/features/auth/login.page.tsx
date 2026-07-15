import { ArrowUpRight, Eye, EyeOff } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthApiError, type LoginInput, type RegisterInput } from '../../services/auth-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { AuthAtmosphere } from './auth-atmosphere.js';
import './auth.css';

type AuthMode = 'login' | 'register';
type FieldErrors = Partial<
  Record<'displayName' | 'organisationName' | 'email' | 'password', string>
>;

export function AuthPage() {
  const location = useLocation();
  const mode: AuthMode = location.pathname === '/register' ? 'register' : 'login';
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const register = useAuthStore((state) => state.register);
  const submitting = useRef(false);
  const formContent = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [formHeight, setFormHeight] = useState<number>();
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [values, setValues] = useState({
    displayName: '',
    organisationName: '',
    email: '',
    password: '',
  });

  const isLogin = mode === 'login';
  const requestedPath = readRequestedPath(location.state);

  useEffect(() => {
    const content = formContent.current;
    if (!content) return;

    const measure = () => setFormHeight(content.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  function update(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setFormError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const validation = validate(mode, values);
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    submitting.current = true;
    setPending(true);
    setFormError('');
    try {
      if (isLogin) {
        const input: LoginInput = { email: values.email.trim(), password: values.password };
        await login(input);
      } else {
        const input: RegisterInput = {
          displayName: values.displayName.trim(),
          organisationName: values.organisationName.trim(),
          email: values.email.trim(),
          password: values.password,
        };
        await register(input);
      }
      setComplete(true);
      window.setTimeout(() => navigate(requestedPath, { replace: true }), 680);
    } catch (error) {
      setFormError(
        error instanceof AuthApiError
          ? error.message
          : 'Something went wrong while signing you in. Please try again.',
      );
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <main className={`auth-page auth-page--${mode} ${complete ? 'auth-page--complete' : ''}`}>
      <AuthAtmosphere />
      <section className="auth-visual" aria-label="TaskOS WorldLab preview">
        <Brand />
        <Mosaic mode={mode} />
        <div className="auth-hero-copy">
          <p className="auth-eyebrow">Controlled software simulation</p>
          <h1>
            One product.
            <br />
            Many possible realities.
          </h1>
          <p>
            Run controlled worlds, expose failures and reproduce the exact conditions behind them.
          </p>
        </div>
      </section>

      <section
        className="auth-panel"
        aria-label={isLogin ? 'Log in to TaskOS' : 'Create TaskOS account'}
      >
        <div className="auth-form-wrap">
          <Brand compact />
          <nav className="auth-tabs" aria-label="Authentication" role="tablist">
            <Link
              aria-selected={isLogin}
              className={isLogin ? 'is-active' : ''}
              role="tab"
              to="/login"
            >
              Log in
            </Link>
            <Link
              aria-selected={!isLogin}
              className={!isLogin ? 'is-active' : ''}
              role="tab"
              to="/register"
            >
              Sign up
            </Link>
            <span className={`auth-tab-indicator auth-tab-indicator--${mode}`} aria-hidden="true" />
          </nav>

          <div
            className="auth-form-viewport"
            data-testid="auth-form-viewport"
            style={
              formHeight
                ? ({ '--auth-form-height': `${formHeight}px` } as CSSProperties)
                : undefined
            }
          >
            <div className="auth-form-content" ref={formContent}>
              <div className="auth-form-heading" key={`${mode}-heading`}>
                <p className="auth-step">
                  {isLogin ? 'Return to your worlds' : 'Begin with one journey'}
                </p>
                <h2>{isLogin ? 'Welcome back' : 'Create your account'}</h2>
                <p>
                  {isLogin
                    ? 'Continue your investigations and active test worlds.'
                    : 'Set up your access and begin testing across parallel worlds.'}
                </p>
              </div>

              <form className="auth-form" key={mode} noValidate onSubmit={submit}>
                {!isLogin && (
                  <div className="auth-register-fields">
                    <AuthField
                      autoComplete="name"
                      error={errors.displayName}
                      id="display-name"
                      label="Full name"
                      onChange={(value) => update('displayName', value)}
                      value={values.displayName}
                    />
                    <AuthField
                      autoComplete="organization"
                      error={errors.organisationName}
                      id="organisation-name"
                      label="Workspace name"
                      onChange={(value) => update('organisationName', value)}
                      value={values.organisationName}
                    />
                  </div>
                )}

                <AuthField
                  autoComplete="email"
                  error={errors.email}
                  id="email"
                  label="Email address"
                  onChange={(value) => update('email', value)}
                  type="email"
                  value={values.email}
                />

                <div className="auth-field">
                  <div className="auth-label-row">
                    <label htmlFor="password">Password</label>
                    {isLogin && (
                      <a
                        className="auth-forgot"
                        href="mailto:support@taskos.dev?subject=Password reset"
                      >
                        Forgot password?
                      </a>
                    )}
                  </div>
                  <div className="auth-password-wrap">
                    <input
                      aria-describedby={errors.password ? 'password-error' : undefined}
                      aria-invalid={Boolean(errors.password)}
                      autoComplete={isLogin ? 'current-password' : 'new-password'}
                      id="password"
                      onChange={(event) => update('password', event.target.value)}
                      type={showPassword ? 'text' : 'password'}
                      value={values.password}
                    />
                    <button
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="auth-password-toggle"
                      onClick={() => setShowPassword((visible) => !visible)}
                      type="button"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <FieldError id="password-error" message={errors.password} />
                  {!isLogin && !errors.password && (
                    <p className="auth-field-hint">Use at least 12 characters.</p>
                  )}
                </div>

                <div
                  aria-live="polite"
                  className="auth-form-error"
                  role={formError ? 'alert' : undefined}
                >
                  {formError}
                </div>

                <button
                  className={`auth-submit ${complete ? 'is-complete' : ''}`}
                  disabled={pending}
                  type="submit"
                >
                  <span>
                    {complete
                      ? 'Opening WorldLab…'
                      : pending
                        ? isLogin
                          ? 'Signing in…'
                          : 'Creating account…'
                        : isLogin
                          ? 'Continue to WorldLab'
                          : 'Create account'}
                  </span>
                  <ArrowUpRight aria-hidden="true" size={19} />
                </button>

                <p className="auth-secondary">
                  {isLogin ? 'New to TaskOS?' : 'Already have an account?'}{' '}
                  <Link to={isLogin ? '/register' : '/login'}>
                    {isLogin ? 'Create an account' : 'Log in'}
                  </Link>
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className={`auth-brand ${compact ? 'auth-brand--compact' : ''}`} to="/login">
      <span className="auth-mark" aria-hidden="true">
        <i />
        <i />
      </span>
      <span>
        <strong>TaskOS</strong>
        <small>WorldLab</small>
      </span>
    </Link>
  );
}

function Mosaic({ mode }: { mode: AuthMode }) {
  const registering = mode === 'register';
  const mosaicStage = useRef<HTMLDivElement>(null);
  const previousRects = useRef(new Map<string, DOMRect>());
  const layoutAnimations = useRef(new Map<string, Animation>());

  useLayoutEffect(() => {
    const stage = mosaicStage.current;
    if (!stage) return;

    const slots = Array.from(stage.querySelectorAll<HTMLElement>('[data-mosaic-slot]'));
    const nextRects = new Map(
      slots.map((slot) => [slot.dataset.mosaicSlot ?? '', slot.getBoundingClientRect()]),
    );
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    for (const slot of slots) {
      const name = slot.dataset.mosaicSlot ?? '';
      const previous = previousRects.current.get(name);
      const next = nextRects.get(name);
      layoutAnimations.current.get(name)?.cancel();

      if (!reduceMotion && previous && next) {
        const x = previous.left - next.left;
        const y = previous.top - next.top;
        if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) {
          slot.dataset.layoutMoving = 'true';
          const animation = slot.animate(
            [
              { transform: `translate3d(${x}px, ${y}px, 0)` },
              { transform: 'translate3d(0, 0, 0)' },
            ],
            { duration: 520, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
          );
          layoutAnimations.current.set(name, animation);
          void animation.finished
            .catch(() => undefined)
            .then(() => {
              if (layoutAnimations.current.get(name) === animation) {
                layoutAnimations.current.delete(name);
                delete slot.dataset.layoutMoving;
              }
            });
        }
      }
    }

    previousRects.current = nextRects;
  }, [mode]);

  useEffect(() => {
    const stage = mosaicStage.current;
    if (!stage) return;
    const capture = () => {
      previousRects.current = new Map(
        Array.from(stage.querySelectorAll<HTMLElement>('[data-mosaic-slot]')).map((slot) => [
          slot.dataset.mosaicSlot ?? '',
          slot.getBoundingClientRect(),
        ]),
      );
    };
    const observer = new ResizeObserver(capture);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const stage = mosaicStage.current;
    if (!stage) return;
    stage.dataset.pointerActive = 'false';
    stage.style.setProperty('--mosaic-x', '0px');
    stage.style.setProperty('--mosaic-y', '0px');
    stage.style.setProperty('--mosaic-rotate', '0deg');
    for (const tile of stage.querySelectorAll<HTMLElement>('[data-depth]')) {
      tile.style.setProperty('--pointer-x', '0px');
      tile.style.setProperty('--pointer-y', '0px');
      tile.style.setProperty('--pointer-rotate', '0deg');
    }
  }, []);

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches
    ) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    const compactRange = window.innerWidth <= 1100;
    const mosaicRange = compactRange ? 8 : 12;
    const tileRange = compactRange ? 5 : 7.5;
    event.currentTarget.dataset.pointerActive = 'true';
    event.currentTarget.style.setProperty('--mosaic-x', `${(x * mosaicRange).toFixed(2)}px`);
    event.currentTarget.style.setProperty('--mosaic-y', `${(y * mosaicRange).toFixed(2)}px`);
    event.currentTarget.style.setProperty('--mosaic-rotate', `${(x * 1.4).toFixed(2)}deg`);
    for (const [index, tile] of Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[data-depth]'),
    ).entries()) {
      const depth = Number(tile.dataset.depth ?? 1);
      const direction = index % 2 === 0 ? 1 : -1;
      tile.style.setProperty('--pointer-x', `${(x * depth * tileRange).toFixed(2)}px`);
      tile.style.setProperty('--pointer-y', `${(y * depth * tileRange).toFixed(2)}px`);
      tile.style.setProperty('--pointer-rotate', `${(x * depth * direction * 1.4).toFixed(2)}deg`);
    }
  }

  function resetPointer() {
    const stage = mosaicStage.current;
    if (!stage) return;
    stage.dataset.pointerActive = 'false';
    stage.style.setProperty('--mosaic-x', '0px');
    stage.style.setProperty('--mosaic-y', '0px');
    stage.style.setProperty('--mosaic-rotate', '0deg');
    for (const tile of stage.querySelectorAll<HTMLElement>('[data-depth]')) {
      tile.style.setProperty('--pointer-x', '0px');
      tile.style.setProperty('--pointer-y', '0px');
      tile.style.setProperty('--pointer-rotate', '0deg');
    }
  }

  return (
    <div
      ref={mosaicStage}
      className="world-mosaic-stage"
      aria-hidden="true"
      onPointerLeave={resetPointer}
      onPointerMove={move}
    >
      <div className="world-mosaic" data-layout={mode} data-testid="auth-mosaic">
        <MosaicSlot name="statement">
          <article
            className="mosaic-tile mosaic-tile--statement"
            data-depth="1.2"
            data-mosaic-tile="statement"
          >
            <span>{registering ? 'Create your' : 'One product'}</span>
            <strong>{registering ? 'first world' : 'many realities'}</strong>
          </article>
        </MosaicSlot>
        <MosaicSlot name="count">
          <article
            className="mosaic-tile mosaic-tile--count"
            data-depth="1.4"
            data-mosaic-tile="count"
          >
            <strong>{registering ? '01' : '04'}</strong>
            <span>{registering ? 'Journey ready' : 'Worlds ready'}</span>
          </article>
        </MosaicSlot>
        <MosaicSlot name="latency">
          <article
            className="mosaic-tile mosaic-tile--latency"
            data-depth="1.1"
            data-mosaic-tile="latency"
          >
            <span>{registering ? 'Local runtime' : '+1200 ms'}</span>
            <strong>{registering ? 'Available' : 'Payment latency'}</strong>
          </article>
        </MosaicSlot>
        <MosaicSlot name="abstract">
          <article
            className="mosaic-tile mosaic-tile--abstract"
            data-depth="0.55"
            data-mosaic-tile="simulation"
          >
            <div className="world-frame world-frame--one" />
            <div className="world-frame world-frame--two" />
            <div className="world-echo" />
            <div className="world-contour" />
            <div className="world-glow" />
            <span>
              SIMULATION / <em>{registering ? '01' : '04'}</em>
            </span>
          </article>
        </MosaicSlot>
        <MosaicSlot name="finding">
          <article
            className="mosaic-tile mosaic-tile--finding"
            data-depth="0.9"
            data-mosaic-tile="finding"
          >
            <span>{registering ? 'No findings yet' : 'Duplicate order'}</span>
            <strong>{registering ? 'Start with a controlled run' : 'Reproduced 3/3'}</strong>
            <i>
              <b aria-hidden="true" /> {registering ? 'READY' : 'CONFIRMED'}
            </i>
          </article>
        </MosaicSlot>
        <MosaicSlot name="logo">
          <article
            className="mosaic-tile mosaic-tile--logo"
            data-depth="1.5"
            data-mosaic-tile="mark"
          >
            <span className="auth-mark auth-mark--large">
              <i />
              <i />
            </span>
          </article>
        </MosaicSlot>
        <MosaicSlot name="status">
          <article
            className="mosaic-tile mosaic-tile--status"
            data-depth="1.3"
            data-mosaic-tile="status"
          >
            <span>{registering ? 'World 01' : 'Last run'}</span>
            <strong>{registering ? 'Ready' : '12 min ago'}</strong>
          </article>
        </MosaicSlot>
      </div>
    </div>
  );
}

function MosaicSlot({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className={`mosaic-slot mosaic-slot--${name}`} data-mosaic-slot={name}>
      {children}
    </div>
  );
}

function AuthField({
  id,
  label,
  value,
  error,
  onChange,
  type = 'text',
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  error: string | undefined;
  onChange(value: string): void;
  type?: string;
  autoComplete: string;
}) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <input
        aria-describedby={error ? `${id}-error` : undefined}
        aria-invalid={Boolean(error)}
        autoComplete={autoComplete}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  return (
    <p className="auth-field-error" id={id}>
      {message ?? ''}
    </p>
  );
}

function validate(mode: AuthMode, values: Record<string, string>): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === 'register') {
    if (!values.displayName?.trim()) errors.displayName = 'Enter your full name.';
    if (!values.organisationName?.trim()) errors.organisationName = 'Enter a workspace name.';
  }
  if (!values.email?.trim()) errors.email = 'Enter your email address.';
  else if (!/^\S+@\S+\.\S+$/.test(values.email)) errors.email = 'Enter a valid email address.';
  if (!values.password) errors.password = 'Enter your password.';
  else if (mode === 'register' && values.password.length < 12) {
    errors.password = 'Password must be at least 12 characters.';
  }
  return errors;
}

function readRequestedPath(state: unknown): string {
  if (
    typeof state === 'object' &&
    state !== null &&
    'from' in state &&
    typeof state.from === 'string' &&
    state.from.startsWith('/') &&
    state.from !== '/login' &&
    state.from !== '/register'
  ) {
    return state.from;
  }
  return '/projects';
}
