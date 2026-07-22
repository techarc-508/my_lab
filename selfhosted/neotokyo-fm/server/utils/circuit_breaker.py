import time, threading, logging
from enum import Enum

logger = logging.getLogger('batch_dl')

class CircuitBreakerState(Enum):
    CLOSED = 'closed'
    OPEN = 'open'
    HALF_OPEN = 'half_open'

class CircuitBreaker:
    def __init__(self, name: str, threshold: int = 5,
                 cooldown: float = 60.0, half_open_max: int = 1):
        self.name = name
        self.threshold = threshold
        self.cooldown = cooldown
        self.half_open_max = half_open_max

        self._state = CircuitBreakerState.CLOSED
        self._failures = 0
        self._opened_at = 0.0
        self._half_open_attempts = 0
        self._lock = threading.RLock()

    @property
    def state(self) -> CircuitBreakerState:
        with self._lock:
            if self._state == CircuitBreakerState.OPEN:
                if time.time() - self._opened_at > self.cooldown:
                    self._state = CircuitBreakerState.HALF_OPEN
                    self._half_open_attempts = 0
                    logger.info(f"Circuit breaker '{self.name}' → HALF_OPEN")
            return self._state

    def _check(self) -> bool:
        with self._lock:
            st = self.state
            if st == CircuitBreakerState.OPEN:
                return False
            if st == CircuitBreakerState.HALF_OPEN:
                if self._half_open_attempts >= self.half_open_max:
                    return False
                self._half_open_attempts += 1
            return True

    def call(self, func, *args, **kwargs):
        if not self._check():
            raise CircuitBreakerOpenError(f"Circuit breaker '{self.name}' is open")
        try:
            result = func(*args, **kwargs)
            self.reset()
            return result
        except Exception as e:
            self._record_failure()
            raise

    def __call__(self, func):
        def wrapper(*args, **kwargs):
            return self.call(func, *args, **kwargs)
        return wrapper

    def record_failure(self):
        with self._lock:
            self._failures += 1
            if self._failures >= self.threshold:
                self._state = CircuitBreakerState.OPEN
                self._opened_at = time.time()
                logger.warning(f"Circuit breaker '{self.name}' opened (failures={self._failures})")

    def _fail(self):
        self._record_failure()

    def _record_failure(self):
        self.record_failure()

    def reset(self):
        with self._lock:
            if self._failures > 0:
                self._failures = 0
                old = self._state
                self._state = CircuitBreakerState.CLOSED
                if old != CircuitBreakerState.CLOSED:
                    logger.info(f"Circuit breaker '{self.name}' → CLOSED (recovered)")

    def is_open(self) -> bool:
        return self.state == CircuitBreakerState.OPEN

    def status(self) -> dict:
        with self._lock:
            return {
                'name': self.name,
                'state': self._state.value,
                'failures': self._failures,
                'threshold': self.threshold,
                'cooldown': self.cooldown,
            }


class CircuitBreakerOpenError(Exception):
    pass


_breakers: dict[str, CircuitBreaker] = {}
_breakers_lock = threading.Lock()


def get_breaker(name: str, threshold: int = 5, cooldown: float = 60.0,
                half_open_max: int = 1) -> CircuitBreaker:
    with _breakers_lock:
        if name not in _breakers:
            _breakers[name] = CircuitBreaker(name, threshold, cooldown, half_open_max)
        return _breakers[name]


def with_circuit_breaker(name: str, threshold: int = 5, cooldown: float = 60.0,
                         half_open_max: int = 1, fallback=None):
    breaker = get_breaker(name, threshold, cooldown, half_open_max)
    def decorator(func):
        def wrapper(*args, **kwargs):
            try:
                return breaker.call(func, *args, **kwargs)
            except CircuitBreakerOpenError:
                if fallback is not None:
                    return fallback(*args, **kwargs)
                raise
        return wrapper
    return decorator


def list_breakers() -> list[dict]:
    with _breakers_lock:
        return [b.status() for b in _breakers.values()]
