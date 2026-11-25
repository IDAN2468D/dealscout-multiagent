"""100% Pure Python deterministic multi-item $75 Israel VAT cart-split optimizer."""

from __future__ import annotations

from dataclasses import dataclass

from backend.app.api.schemas import (
    CartPackageSummary,
    CartSplitRequest,
    CartSplitResponse,
)
from backend.app.core.config import settings
from backend.app.tools.landed_cost_tools import resolve_fx_rate_ils


@dataclass(frozen=True)
class _UnitItem:
    sku: str
    title: str
    unit_price_usd: float


def _evaluate_package(
    subtotal_usd: float,
    shipping_per_package_usd: float,
    free_shipping_threshold_usd: float | None,
    ship_to_country: str,
) -> tuple[float, bool, float, float]:
    """Return (shipping_usd, vat_applied, vat_amount_usd, total_usd) for a package."""
    sub = round(subtotal_usd, 2)
    if (
        free_shipping_threshold_usd is not None
        and sub >= free_shipping_threshold_usd
    ):
        shipping_usd = 0.0
    else:
        shipping_usd = round(shipping_per_package_usd, 2)

    country = (ship_to_country or "IL").strip().upper()
    if country == "IL" and sub > settings.ISRAEL_VAT_EXEMPTION_USD:
        vat_applied = True
        vat_amount_usd = round((sub + shipping_usd) * settings.ISRAEL_VAT_RATE, 2)
    else:
        vat_applied = False
        vat_amount_usd = 0.0

    total_usd = round(sub + shipping_usd + vat_amount_usd, 2)
    return shipping_usd, vat_applied, vat_amount_usd, total_usd


def _exact_partition_dp(
    units: list[_UnitItem],
    shipping_per_package_usd: float,
    free_shipping_threshold_usd: float | None,
    ship_to_country: str,
) -> list[list[_UnitItem]]:
    """Exact bitmask DP over <= 14 unit items using the single-taxable-bin theorem."""
    n = len(units)
    full_mask = (1 << n) - 1
    prices = [u.unit_price_usd for u in units]

    subset_sum = [0.0] * (1 << n)
    subset_cost = [0.0] * (1 << n)
    tax_free_masks: list[int] = []

    for mask in range(1, 1 << n):
        lsb = mask & -mask
        bit_idx = lsb.bit_length() - 1
        sub = round(subset_sum[mask ^ lsb] + prices[bit_idx], 2)
        subset_sum[mask] = sub
        _, _, _, cost = _evaluate_package(
            sub,
            shipping_per_package_usd,
            free_shipping_threshold_usd,
            ship_to_country,
        )
        subset_cost[mask] = cost
        if sub <= settings.ISRAEL_VAT_EXEMPTION_USD:
            tax_free_masks.append(mask)

    # Index tax-free masks by their lowest set bit for fast exact transition
    by_lsb: dict[int, list[int]] = {i: [] for i in range(n)}
    for m in tax_free_masks:
        by_lsb[(m & -m).bit_length() - 1].append(m)

    dp_cost = [float("inf")] * (1 << n)
    dp_choice: list[int] = [0] * (1 << n)
    dp_cost[0] = 0.0

    for mask in range(1, 1 << n):
        # Option 1: put entire remaining mask into one package (possibly > $75)
        best_c = subset_cost[mask]
        best_sub = mask

        # Option 2: peel off a tax-free package (<= $75) containing the lowest set bit
        first_bit = (mask & -mask).bit_length() - 1
        for sub_mask in by_lsb[first_bit]:
            if (sub_mask & mask) == sub_mask:
                rem = mask ^ sub_mask
                candidate_c = round(subset_cost[sub_mask] + dp_cost[rem], 4)
                if candidate_c < best_c:
                    best_c = candidate_c
                    best_sub = sub_mask

        dp_cost[mask] = best_c
        dp_choice[mask] = best_sub

    groups: list[list[_UnitItem]] = []
    cur = full_mask
    while cur:
        chosen = dp_choice[cur]
        groups.append([units[i] for i in range(n) if chosen & (1 << i)])
        cur ^= chosen
    return groups


def _heuristic_bfd_partition(
    units: list[_UnitItem],
    shipping_per_package_usd: float,
    free_shipping_threshold_usd: float | None,
    ship_to_country: str,
) -> list[list[_UnitItem]]:
    """Best-Fit Decreasing heuristic for carts exceeding 14 unit items."""
    tax_free_limit = settings.ISRAEL_VAT_EXEMPTION_USD
    sorted_units = sorted(units, key=lambda u: u.unit_price_usd, reverse=True)

    tax_free_bins: list[list[_UnitItem]] = []
    tax_free_sums: list[float] = []
    taxable_bin: list[_UnitItem] = []

    for unit in sorted_units:
        if unit.unit_price_usd > tax_free_limit:
            taxable_bin.append(unit)
            continue

        best_idx = -1
        best_rem = float("inf")
        for idx, cur_sum in enumerate(tax_free_sums):
            new_sum = round(cur_sum + unit.unit_price_usd, 2)
            if new_sum <= tax_free_limit:
                rem = tax_free_limit - new_sum
                if rem < best_rem:
                    best_rem = rem
                    best_idx = idx

        if best_idx >= 0:
            tax_free_bins[best_idx].append(unit)
            tax_free_sums[best_idx] = round(tax_free_sums[best_idx] + unit.unit_price_usd, 2)
        else:
            tax_free_bins.append([unit])
            tax_free_sums.append(unit.unit_price_usd)

    groups = tax_free_bins + ([taxable_bin] if taxable_bin else [])

    # Check if merging any pair reduces total landed cost (e.g. non-IL or free shipping)
    def _group_cost(grp: list[_UnitItem]) -> float:
        sub = sum(u.unit_price_usd for u in grp)
        return _evaluate_package(
            sub, shipping_per_package_usd, free_shipping_threshold_usd, ship_to_country
        )[3]

    improved = True
    while improved and len(groups) > 1:
        improved = False
        best_pair: tuple[int, int] | None = None
        best_gain = 0.0
        for i in range(len(groups)):
            for j in range(i + 1, len(groups)):
                merged = groups[i] + groups[j]
                gain = round(_group_cost(groups[i]) + _group_cost(groups[j]) - _group_cost(merged), 4)
                if gain > best_gain:
                    best_gain = gain
                    best_pair = (i, j)
        if best_pair is not None:
            i, j = best_pair
            groups[i] = groups[i] + groups[j]
            groups.pop(j)
            improved = True

    return groups


def _format_package_items(group: list[_UnitItem]) -> list[str]:
    """Summarize unit items in a package cleanly (grouping identical SKUs)."""
    counts: dict[str, tuple[str, int]] = {}
    for u in group:
        if u.sku in counts:
            title, qty = counts[u.sku]
            counts[u.sku] = (title, qty + 1)
        else:
            counts[u.sku] = (u.title, 1)
    labels: list[str] = []
    for sku, (title, qty) in counts.items():
        if qty > 1:
            labels.append(f"{qty}x {title} ({sku})")
        else:
            labels.append(f"{title} ({sku})")
    return labels


def optimize_cart_tax_split(
    request: CartSplitRequest,
    fx_rate_ils: float | None = None,
) -> CartSplitResponse:
    """Deterministically compare single combined shipment vs optimal $75-VAT split."""
    fx_rate = resolve_fx_rate_ils(fx_rate_ils)
    units: list[_UnitItem] = []
    for item in request.items:
        for _ in range(item.quantity):
            units.append(
                _UnitItem(
                    sku=item.sku,
                    title=item.title,
                    unit_price_usd=round(float(item.unit_price_usd), 2),
                )
            )

    # 1. Baseline: single combined shipment
    combined_sub = round(sum(u.unit_price_usd for u in units), 2)
    base_ship, base_vat_applied, base_vat_usd, base_total_usd = _evaluate_package(
        combined_sub,
        request.shipping_per_package_usd,
        request.free_shipping_threshold_usd,
        request.ship_to_country,
    )
    base_total_ils = round(base_total_usd * fx_rate, 2)

    # 2. Optimal partition
    if len(units) <= 14:
        groups = _exact_partition_dp(
            units,
            request.shipping_per_package_usd,
            request.free_shipping_threshold_usd,
            request.ship_to_country,
        )
    else:
        groups = _heuristic_bfd_partition(
            units,
            request.shipping_per_package_usd,
            request.free_shipping_threshold_usd,
            request.ship_to_country,
        )

    split_total_usd = 0.0
    split_packages: list[CartPackageSummary] = []
    for idx, grp in enumerate(groups, start=1):
        sub = round(sum(u.unit_price_usd for u in grp), 2)
        ship, vat_applied, vat_usd, pkg_usd = _evaluate_package(
            sub,
            request.shipping_per_package_usd,
            request.free_shipping_threshold_usd,
            request.ship_to_country,
        )
        split_total_usd = round(split_total_usd + pkg_usd, 2)
        split_packages.append(
            CartPackageSummary(
                package_index=idx,
                items=_format_package_items(grp),
                items_subtotal_usd=sub,
                shipping_usd=ship,
                vat_applied=vat_applied,
                vat_amount_usd=vat_usd,
                package_total_usd=pkg_usd,
                package_total_ils=round(pkg_usd * fx_rate, 2),
            )
        )

    if len(split_packages) > 1 and split_total_usd < base_total_usd:
        recommended_strategy = "SPLIT_PACKAGES"
        optimized_total_usd = split_total_usd
        optimized_total_ils = round(sum(p.package_total_ils for p in split_packages), 2)
        final_packages = split_packages
        saved_usd = round(base_total_usd - optimized_total_usd, 2)
        saved_ils = round(max(0.0, base_total_ils - optimized_total_ils), 2)
        explanation = (
            f"Splitting into {len(final_packages)} packages keeps sub-orders under the "
            f"${settings.ISRAEL_VAT_EXEMPTION_USD:.0f} Israel VAT exemption threshold, "
            f"saving ${saved_usd:.2f} (₪{saved_ils:.2f}) vs. single combined shipment "
            f"(${base_total_usd:.2f} -> ${optimized_total_usd:.2f})."
        )
    else:
        recommended_strategy = "SINGLE_SHIPMENT"
        optimized_total_usd = base_total_usd
        optimized_total_ils = base_total_ils
        saved_usd = 0.0
        saved_ils = 0.0
        final_packages = [
            CartPackageSummary(
                package_index=1,
                items=_format_package_items(units),
                items_subtotal_usd=combined_sub,
                shipping_usd=base_ship,
                vat_applied=base_vat_applied,
                vat_amount_usd=base_vat_usd,
                package_total_usd=base_total_usd,
                package_total_ils=base_total_ils,
            )
        ]
        explanation = (
            f"Keeping all items in a single shipment (${base_total_usd:.2f} / ₪{base_total_ils:.2f}) "
            f"is optimal after accounting for shipping (${base_ship:.2f}) and VAT rules."
        )

    return CartSplitResponse(
        store_name=request.store_name,
        ship_to_country=request.ship_to_country.upper(),
        recommended_strategy=recommended_strategy,
        baseline_combined_usd=base_total_usd,
        baseline_combined_ils=base_total_ils,
        baseline_vat_usd=base_vat_usd,
        optimized_total_usd=optimized_total_usd,
        optimized_total_ils=optimized_total_ils,
        saved_usd=saved_usd,
        saved_ils=saved_ils,
        packages=final_packages,
        explanation=explanation,
    )
