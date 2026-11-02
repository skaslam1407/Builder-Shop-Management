#![allow(dead_code)]

//! Decimal-safe financial helpers.
//!
//! All monetary values are integer paise. Tax rates are integer basis points.
//! Rounding is round-half-up and must only be performed in the backend.

/// Divide two positive integers, rounding half up.
pub fn round_div_half_up(numerator: i64, denominator: i64) -> i64 {
    if denominator <= 0 {
        return 0;
    }
    let numerator = numerator.max(0);
    (numerator + denominator / 2) / denominator
}

/// Compute tax for a taxable amount at a basis-point rate.
pub fn tax_for(taxable_minor: i64, rate_bps: i64) -> i64 {
    round_div_half_up(taxable_minor.saturating_mul(rate_bps), 10_000)
}

/// Split tax into CGST/SGST (intra-state) or IGST (inter-state).
/// Returns `(cgst, sgst, igst)` in paise.
pub fn split_gst(taxable_minor: i64, rate_bps: i64, inter_state: bool) -> (i64, i64, i64) {
    let tax = tax_for(taxable_minor, rate_bps);
    if inter_state {
        (0, 0, tax)
    } else {
        let cgst = tax / 2;
        (cgst, tax - cgst, 0)
    }
}

/// Line total before tax, after discount.
pub fn taxable_amount(rate_minor: i64, quantity_milli: i64, discount_minor: i64) -> i64 {
    let gross = round_div_half_up(rate_minor.saturating_mul(quantity_milli), 1_000);
    (gross - discount_minor.max(0)).max(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gst_split_is_exact_for_even_tax() {
        assert_eq!(split_gst(10_000, 1_800, false), (900, 900, 0));
    }

    #[test]
    fn gst_split_carries_odd_paise_to_sgst() {
        assert_eq!(split_gst(1_000, 500, false), (25, 25, 0));
        assert_eq!(split_gst(333, 1_500, false), (25, 25, 0));
    }

    #[test]
    fn inter_state_tax_uses_igst_only() {
        assert_eq!(split_gst(10_000, 1_800, true), (0, 0, 1_800));
    }

    #[test]
    fn tax_rounds_half_up() {
        assert_eq!(tax_for(9_999, 1_800), 1_800);
        assert_eq!(tax_for(1, 1_800), 0);
        assert_eq!(tax_for(3, 1_800), 1);
    }

    #[test]
    fn taxable_amount_uses_milli_quantities() {
        assert_eq!(taxable_amount(10_000, 1_000, 0), 10_000);
        assert_eq!(taxable_amount(10_000, 1_500, 500), 14_500);
        assert_eq!(taxable_amount(10_000, 1_000, 12_000), 0);
    }
}
