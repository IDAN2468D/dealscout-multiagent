"""Initial schema for all 10 DealScout AI tables.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-25 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001_initial_schema"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("oauth_provider", sa.String(length=50), nullable=True),
        sa.Column("role", sa.String(length=20), server_default="FREE", nullable=False),
        sa.Column("tier", sa.String(length=20), server_default="FREE", nullable=False),
        sa.Column("is_verified", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("verification_token", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # 2. refresh_tokens
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("token_hash", sa.String(length=128), nullable=False),
        sa.Column("family_id", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("replaced_by_hash", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"], unique=False)
    op.create_index("ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True)
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)

    # 3. user_buyer_profiles
    op.create_table(
        "user_buyer_profiles",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("preferred_currency", sa.String(length=10), server_default="ILS", nullable=False),
        sa.Column("ship_to_country", sa.String(length=4), server_default="IL", nullable=False),
        sa.Column("credit_card_clubs_json", sa.JSON(), nullable=False),
        sa.Column("min_seller_trust", sa.Integer(), server_default="75", nullable=False),
        sa.Column("preferred_stores_json", sa.JSON(), nullable=False),
        sa.Column("notification_channels_json", sa.JSON(), nullable=False),
        sa.Column("telegram_chat_id", sa.String(length=64), nullable=True),
        sa.Column("long_term_preferences_json", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id"),
    )

    # 4. user_search_history
    op.create_table(
        "user_search_history",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("query", sa.String(length=500), nullable=False),
        sa.Column("model_id", sa.String(length=100), server_default="gemini-3.5-flash-lite", nullable=False),
        sa.Column("best_landed_ils", sa.Float(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("output_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("cached_tokens", sa.Integer(), server_default="0", nullable=False),
        sa.Column("llm_cost_usd", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("duration_ms", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_search_history_user_id", "user_search_history", ["user_id"], unique=False)

    # 5. user_savings_ledger
    op.create_table(
        "user_savings_ledger",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("source_type", sa.String(length=32), nullable=False),
        sa.Column("saved_ils", sa.Float(), nullable=False),
        sa.Column("saved_usd", sa.Float(), server_default="0.0", nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("reference_sku", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_savings_ledger_user_id", "user_savings_ledger", ["user_id"], unique=False)

    # 6. coupon_feedback
    op.create_table(
        "coupon_feedback",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("coupon_code", sa.String(length=64), nullable=False),
        sa.Column("store_name", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("worked", sa.Boolean(), nullable=False),
        sa.Column("cart_total_usd", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_coupon_feedback_coupon_code", "coupon_feedback", ["coupon_code"], unique=False)
    op.create_index("ix_coupon_feedback_store_name", "coupon_feedback", ["store_name"], unique=False)
    op.create_index("ix_coupon_feedback_user_id", "coupon_feedback", ["user_id"], unique=False)

    # 7. price_history
    op.create_table(
        "price_history",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("product_id", sa.String(length=64), nullable=False),
        sa.Column("sku", sa.String(length=64), nullable=False),
        sa.Column("store_name", sa.String(length=64), nullable=False),
        sa.Column("price_usd", sa.Float(), nullable=False),
        sa.Column("original_listed_usd", sa.Float(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_price_history_product_id", "price_history", ["product_id"], unique=False)
    op.create_index("ix_price_history_recorded_at", "price_history", ["recorded_at"], unique=False)
    op.create_index("ix_price_history_sku", "price_history", ["sku"], unique=False)
    op.create_index("ix_price_history_store_name", "price_history", ["store_name"], unique=False)

    # 8. watchlists
    op.create_table(
        "watchlists",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("product_id", sa.String(length=64), nullable=False),
        sa.Column("sku", sa.String(length=64), nullable=False),
        sa.Column("product_title", sa.String(length=255), nullable=False),
        sa.Column("store_name", sa.String(length=64), nullable=True),
        sa.Column("target_price_ils", sa.Float(), nullable=True),
        sa.Column("target_price_usd", sa.Float(), nullable=True),
        sa.Column("last_seen_price_usd", sa.Float(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_watchlists_product_id", "watchlists", ["product_id"], unique=False)
    op.create_index("ix_watchlists_user_id", "watchlists", ["user_id"], unique=False)

    # 9. pending_approvals
    op.create_table(
        "pending_approvals",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("product_id", sa.String(length=64), nullable=False),
        sa.Column("sku", sa.String(length=64), nullable=False),
        sa.Column("product_title", sa.String(length=255), nullable=False),
        sa.Column("store_name", sa.String(length=64), nullable=False),
        sa.Column("affiliate_url", sa.Text(), nullable=False),
        sa.Column("total_landed_usd", sa.Float(), nullable=False),
        sa.Column("total_landed_ils", sa.Float(), nullable=False),
        sa.Column("applied_coupons_json", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="PENDING_APPROVAL", nullable=False),
        sa.Column("user_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pending_approvals_user_id", "pending_approvals", ["user_id"], unique=False)

    # 10. audit_logs
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=True),
        sa.Column("event_type", sa.String(length=64), nullable=False),
        sa.Column("severity", sa.String(length=20), server_default="INFO", nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=True),
        sa.Column("resource_id", sa.String(length=128), nullable=True),
        sa.Column("details_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_event_type", "audit_logs", ["event_type"], unique=False)
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_audit_logs_user_id", table_name="audit_logs")
    op.drop_index("ix_audit_logs_event_type", table_name="audit_logs")
    op.drop_table("audit_logs")

    op.drop_index("ix_pending_approvals_user_id", table_name="pending_approvals")
    op.drop_table("pending_approvals")

    op.drop_index("ix_watchlists_user_id", table_name="watchlists")
    op.drop_index("ix_watchlists_product_id", table_name="watchlists")
    op.drop_table("watchlists")

    op.drop_index("ix_price_history_store_name", table_name="price_history")
    op.drop_index("ix_price_history_sku", table_name="price_history")
    op.drop_index("ix_price_history_recorded_at", table_name="price_history")
    op.drop_index("ix_price_history_product_id", table_name="price_history")
    op.drop_table("price_history")

    op.drop_index("ix_coupon_feedback_user_id", table_name="coupon_feedback")
    op.drop_index("ix_coupon_feedback_store_name", table_name="coupon_feedback")
    op.drop_index("ix_coupon_feedback_coupon_code", table_name="coupon_feedback")
    op.drop_table("coupon_feedback")

    op.drop_index("ix_user_savings_ledger_user_id", table_name="user_savings_ledger")
    op.drop_table("user_savings_ledger")

    op.drop_index("ix_user_search_history_user_id", table_name="user_search_history")
    op.drop_table("user_search_history")

    op.drop_table("user_buyer_profiles")

    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_family_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
