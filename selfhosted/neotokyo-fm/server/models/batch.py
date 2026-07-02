import json, time, threading
from dataclasses import dataclass, field, asdict
from typing import Optional

@dataclass
class Batch:
    id: str
    title: str = ''
    url: str = ''
    status: str = 'pending'
    created_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    total_files: int = 0
    completed_files: int = 0
    files: list = field(default_factory=list)
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict) -> "Batch":
        return Batch(**{k: v for k, v in d.items() if k in Batch.__dataclass_fields__})
