from __future__ import annotations

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.orm import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    daily_calorie_limit: Mapped[int] = mapped_column(Integer, nullable=False, default=2000)
    diet_type: Mapped[str | None] = mapped_column(String, nullable=True)
    goal_type: Mapped[str | None] = mapped_column(String, nullable=True)
    goal_target_days: Mapped[int | None] = mapped_column(Integer, nullable=True, default=30)
    goal_started_at: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[str] = mapped_column(String, nullable=False)

    scan_history: Mapped[list["ScanHistory"]] = relationship("ScanHistory", back_populates="user")
    food_logs: Mapped[list["FoodLog"]] = relationship("FoodLog", back_populates="user")
    scan_sessions: Mapped[list["ScanSession"]] = relationship("ScanSession", back_populates="user")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    barcode: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    product_name: Mapped[str] = mapped_column(String, nullable=False)
    brand: Mapped[str | None] = mapped_column(String, nullable=True)
    nutriscore: Mapped[str | None] = mapped_column(String, nullable=True)
    ingredients: Mapped[str | None] = mapped_column(Text, nullable=True)
    additives: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String, nullable=False)

    nutrition: Mapped["Nutrition | None"] = relationship(
        "Nutrition",
        back_populates="product",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Nutrition(Base):
    __tablename__ = "nutrition"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)

    calories: Mapped[float | None] = mapped_column(Float, nullable=True)
    fat: Mapped[float | None] = mapped_column(Float, nullable=True)
    sugar: Mapped[float | None] = mapped_column(Float, nullable=True)
    salt: Mapped[float | None] = mapped_column(Float, nullable=True)
    protein: Mapped[float | None] = mapped_column(Float, nullable=True)
    fiber: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbs: Mapped[float | None] = mapped_column(Float, nullable=True)

    product: Mapped[Product] = relationship("Product", back_populates="nutrition")


class ScanHistory(Base):
    __tablename__ = "scan_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    barcode: Mapped[str] = mapped_column(String, nullable=False)
    scan_time: Mapped[str] = mapped_column(String, nullable=False)
    result: Mapped[str] = mapped_column(String, nullable=False)

    user: Mapped[User] = relationship("User", back_populates="scan_history")


class ScanSession(Base):
    __tablename__ = "scan_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    barcode: Mapped[str] = mapped_column(String, nullable=False)
    product_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("products.id"), nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)

    user: Mapped[User] = relationship("User", back_populates="scan_sessions")
    product: Mapped[Product | None] = relationship("Product")
    measurement: Mapped["PortionMeasurement | None"] = relationship(
        "PortionMeasurement", back_populates="scan_session", uselist=False,
        cascade="all, delete-orphan",
    )
    food_log: Mapped["FoodLog | None"] = relationship("FoodLog", back_populates="scan_session", uselist=False)


class PortionMeasurement(Base):
    __tablename__ = "portion_measurements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    scan_session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("scan_sessions.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    weight_grams: Mapped[float] = mapped_column(Float, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False)
    stability: Mapped[str] = mapped_column(String, nullable=False, default="stable")
    measured_at: Mapped[str] = mapped_column(String, nullable=False)

    scan_session: Mapped[ScanSession] = relationship("ScanSession", back_populates="measurement")


class FoodLog(Base):
    __tablename__ = "daily_food_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, default=1)
    barcode: Mapped[str] = mapped_column(String, nullable=False)
    product_name: Mapped[str] = mapped_column(String, nullable=False)
    calories: Mapped[float | None] = mapped_column(Float, nullable=True)
    fat: Mapped[float | None] = mapped_column(Float, nullable=True)
    sugar: Mapped[float | None] = mapped_column(Float, nullable=True)
    salt: Mapped[float | None] = mapped_column(Float, nullable=True)
    protein: Mapped[float | None] = mapped_column(Float, nullable=True)
    fiber: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbs: Mapped[float | None] = mapped_column(Float, nullable=True)
    scan_session_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("scan_sessions.id"), nullable=True, unique=True
    )
    weight_grams: Mapped[float | None] = mapped_column(Float, nullable=True)
    consumed_at: Mapped[str] = mapped_column(String, nullable=False)

    user: Mapped[User] = relationship("User", back_populates="food_logs")
    scan_session: Mapped[ScanSession | None] = relationship("ScanSession", back_populates="food_log")
