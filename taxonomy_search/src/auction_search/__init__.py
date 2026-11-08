"""Taxonomy-driven natural-language search for auction lots.

The source data (auctions and lots) lives in PostgreSQL, database ``events_monitor_db``,
schema ``drouot_collector``. This package only reads that schema; its own tables are
created in a separate ``auction_search`` schema (from Phase 2 onwards).
"""

__version__ = "0.1.0"
