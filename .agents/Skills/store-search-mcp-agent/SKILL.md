---
name: store-search-mcp-agent
description: Searches multi-store offers, stock, and shipping via Elasticsearch fuzzy catalog, ecommerce-mcp READ tools, and Gemini Google Search Grounding (search=True).
---

# Store Search MCP Agent (`store-search-mcp-agent`)

## Role & Model
- **Source:** `backend/app/search/elasticsearch_catalog.py`, `backend/app/mcp_servers/ecommerce_mcp.py`
- **Model:** `gemini-3.5-flash-lite` with `search=True` (Google Search Grounding)
- **Access:** `READ` (`FREE` tier and above)

## Tools
- `fuzzy_search_catalog(query, limit)` / `get_product_by_id_or_sku(identifier)`
- `ecommerce_mcp.search_store_offers(query, stores, user_id, ship_to_country)`
- `ecommerce_mcp.check_stock_shipping(product_id, store_name, ship_to_country, user_id)`

## Responsibilities
1. Normalize product model queries (e.g. `"sony xm5"` -> `SONY-WH1000XM5`) across 6 stores: `Amazon`, `AliExpress`, `ASOS`, `eBay`, `KSP`, and `Terminal X`.
2. Enforce `settings.MCP_STORE_TIMEOUT_SECONDS` (`3.0s`) per store with graceful degradation if any store times out.
3. Run `sanitize_external_text` on every external title and description before returning offers to LLM agents.
