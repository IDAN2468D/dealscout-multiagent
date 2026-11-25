---
name: multimodal-product-matcher
description: Extracts exact brand, model, and SKU/ASIN from product screenshots, photos, or URLs using Gemini 3.5 Flash-Lite Vision and url_context=True with deterministic offline fallback.
---

# Multimodal Product Matcher (`multimodal-product-matcher`)

## Role & Model
- **Source:** `backend/app/agents/multimodal_matcher.py` (`extract_sku_from_media`)
- **Model:** `gemini-3.5-flash-lite` (`settings.GEMINI_SUBAGENT_MODEL`)
- **Capabilities:** Vision (`types.Part.from_bytes`), URL Context (`url_context=True`), `PRO` tier gated (`POST /api/v1/deals/match-from-image`).

## Responsibilities
1. Accept `MatchFromImageRequest` (`product_url`, `image_base64`, `image_mime_type`, `hint_text`).
2. When `GOOGLE_API_KEY` is configured and `LLM_EXECUTION_MODE != "mock"`, invoke `google.genai.Client` with `gemini-3.5-flash-lite`, enabling `types.Tool(url_context=types.UrlContext())` for URLs and `types.Part.from_bytes(...)` for base64 images.
3. Provide deterministic fallback extraction (Amazon `/dp/<ASIN>`, SKU/model keyword signatures like `WH-1000XM5`, `NINJA-NC501`, `SAM-T7`, `AAPL-APP2`, and `hint_text` parsing) so matching works reliably both online and offline.
4. Return normalized `detected_brand`, `detected_model`, `detected_sku`, `confidence`, `extraction_method`, and `search_query` for `DealOrchestratorAgent` cross-store price comparison.
