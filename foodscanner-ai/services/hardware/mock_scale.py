from __future__ import annotations

from datetime import datetime, timezone

from services.hardware.interface import Scale, WeightReading


class MockScale(Scale):
    def __init__(self, weight_grams: float = 126.0, stability: str = "stable") -> None:
        self.weight_grams = float(weight_grams)
        self.stability = stability

    def read_weight(self) -> WeightReading:
        return WeightReading(
            grams=self.weight_grams,
            timestamp=datetime.now(timezone.utc),
            source="mock",
            stability=self.stability,
        )
