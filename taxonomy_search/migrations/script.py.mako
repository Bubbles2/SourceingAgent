"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""

from __future__ import annotations

import os

import sqlalchemy as sa
from alembic import op
${imports if imports else ""}

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade(app_schema: str = "auction_search") -> None:
    ${upgrades if upgrades else "pass"}


def downgrade(app_schema: str = "auction_search") -> None:
    # Destructive: only with AUCTION_SEARCH_ALLOW_DESTRUCTIVE=1 (see docs/DATABASE.md).
    if os.environ.get("AUCTION_SEARCH_ALLOW_DESTRUCTIVE") != "1":
        raise RuntimeError("downgrade is destructive; set AUCTION_SEARCH_ALLOW_DESTRUCTIVE=1 to proceed")
    ${downgrades if downgrades else "pass"}
