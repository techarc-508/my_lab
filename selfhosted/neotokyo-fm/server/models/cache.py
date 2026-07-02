import time, threading
from collections import OrderedDict

class LRUCache:
    __slots__ = ('_data', '_lock', '_maxsize', '_ttl')
    def __init__(self, maxsize: int = 128, ttl: float = 300):
        self._data: OrderedDict = OrderedDict()
        self._lock = threading.Lock()
        self._maxsize = maxsize
        self._ttl = ttl
    def get(self, key: str):
        with self._lock:
            if key not in self._data:
                return None
            entry = self._data[key]
            if time.time() - entry['ts'] >= self._ttl:
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return entry['value']
    def set(self, key: str, value):
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
            self._data[key] = {'value': value, 'ts': time.time()}
            while len(self._data) > self._maxsize:
                self._data.popitem(last=False)
    def cleanup(self):
        now = time.time()
        with self._lock:
            expired = [k for k, v in self._data.items() if now - v['ts'] >= self._ttl]
            for k in expired:
                del self._data[k]
            return len(expired)
