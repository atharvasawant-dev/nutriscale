from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class WeightReading:
    grams: float
    timestamp: datetime
    source: str
    stability: str


class Scale(ABC):
    @abstractmethod
    def read_weight(self) -> WeightReading:
        """Read the current weight from a scale."""
