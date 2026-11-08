"""External auction search (Phase 8): provider adapters, a mock provider and the orchestrator.

No real external provider is integrated: none has documented API access or credentials for this
project, and scraping or undocumented endpoints are out of scope. New providers implement
``base.AuctionProvider`` without changes to the taxonomy or the search engine.
"""
