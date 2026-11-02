use chrono::{Datelike, NaiveDate};

use crate::error::{AppError, AppResult};
use crate::models::{InvoiceLinePreview, InvoicePreview, SalesInvoiceLineInput};
use crate::money::{round_div_half_up, split_gst};

pub fn compute_invoice(
    invoice_type: &str,
    is_inter_state: bool,
    lines: &[SalesInvoiceLineInput],
) -> AppResult<InvoicePreview> {
    if invoice_type != "GST" && invoice_type != "NON_GST" {
        return Err(AppError::Validation(
            "Invoice type must be GST or NON_GST".into(),
        ));
    }
    if lines.is_empty() {
        return Err(AppError::Validation(
            "An invoice must have at least one line".into(),
        ));
    }
    if lines.len() > 200 {
        return Err(AppError::Validation(
            "An invoice cannot have more than 200 lines".into(),
        ));
    }

    let mut subtotal_minor: i64 = 0;
    let mut discount_minor: i64 = 0;
    let mut taxable_minor: i64 = 0;
    let mut cgst_minor: i64 = 0;
    let mut sgst_minor: i64 = 0;
    let mut igst_minor: i64 = 0;
    let mut preview_lines = Vec::with_capacity(lines.len());

    for (index, line) in lines.iter().enumerate() {
        if line.quantity_milli <= 0 {
            return Err(AppError::Validation(format!(
                "Line {} quantity must be greater than zero",
                index + 1
            )));
        }
        if line.rate_minor < 0 {
            return Err(AppError::Validation(format!(
                "Line {} rate cannot be negative",
                index + 1
            )));
        }
        let discount_line = line.discount_minor.unwrap_or(0);
        if discount_line < 0 {
            return Err(AppError::Validation(format!(
                "Line {} discount cannot be negative",
                index + 1
            )));
        }

        let gross = line
            .rate_minor
            .checked_mul(line.quantity_milli)
            .map(|value| round_div_half_up(value, 1_000))
            .ok_or_else(|| {
                AppError::Validation(format!("Line {} amount is too large", index + 1))
            })?;
        if discount_line > gross {
            return Err(AppError::Validation(format!(
                "Line {} discount cannot exceed the line amount",
                index + 1
            )));
        }

        let line_taxable = gross - discount_line;
        let tax_rate_bps = line.tax_rate_bps.unwrap_or(0);
        if !(0..=10_000).contains(&tax_rate_bps) {
            return Err(AppError::Validation(format!(
                "Line {} tax rate must be between 0 and 100%",
                index + 1
            )));
        }

        let (line_cgst, line_sgst, line_igst) = if invoice_type == "GST" {
            split_gst(line_taxable, tax_rate_bps, is_inter_state)
        } else {
            if tax_rate_bps != 0 {
                return Err(AppError::Validation(format!(
                    "Line {} cannot have tax on a non-GST invoice",
                    index + 1
                )));
            }
            (0, 0, 0)
        };

        let line_tax = line_cgst + line_sgst + line_igst;
        let line_total = line_taxable + line_tax;

        subtotal_minor = subtotal_minor.saturating_add(gross);
        discount_minor = discount_minor.saturating_add(discount_line);
        taxable_minor = taxable_minor.saturating_add(line_taxable);
        cgst_minor = cgst_minor.saturating_add(line_cgst);
        sgst_minor = sgst_minor.saturating_add(line_sgst);
        igst_minor = igst_minor.saturating_add(line_igst);

        preview_lines.push(InvoiceLinePreview {
            index: index as i64,
            taxable_minor: line_taxable,
            cgst_minor: line_cgst,
            sgst_minor: line_sgst,
            igst_minor: line_igst,
            tax_minor: line_tax,
            line_total_minor: line_total,
        });
    }

    Ok(InvoicePreview {
        subtotal_minor,
        discount_minor,
        taxable_minor,
        cgst_minor,
        sgst_minor,
        igst_minor,
        other_tax_minor: 0,
        grand_total_minor: taxable_minor + cgst_minor + sgst_minor + igst_minor,
        lines: preview_lines,
    })
}

pub fn fiscal_year_for(date: NaiveDate, start_month: u32) -> String {
    let start_month = start_month.clamp(1, 12);
    let year = if date.month() >= start_month {
        date.year()
    } else {
        date.year() - 1
    };
    format!("{}-{:02}", year, (year + 1) % 100)
}

pub fn format_invoice_number(prefix: &str, fiscal_year: &str, number: i64) -> String {
    format!("{prefix}/{fiscal_year}/{number:05}")
}

use crate::models::{PurchaseInvoiceLineInput, PurchaseLinePreview, PurchasePreview};

pub fn compute_purchase(lines: &[PurchaseInvoiceLineInput]) -> AppResult<PurchasePreview> {
    if lines.is_empty() {
        return Err(AppError::Validation(
            "A purchase must have at least one line".into(),
        ));
    }
    if lines.len() > 200 {
        return Err(AppError::Validation(
            "A purchase cannot have more than 200 lines".into(),
        ));
    }

    let mut subtotal_minor: i64 = 0;
    let mut discount_minor: i64 = 0;
    let mut taxable_minor: i64 = 0;
    let mut tax_minor: i64 = 0;
    let mut preview_lines = Vec::with_capacity(lines.len());

    for (index, line) in lines.iter().enumerate() {
        if line.quantity_milli <= 0 {
            return Err(AppError::Validation(format!(
                "Line {} quantity must be greater than zero",
                index + 1
            )));
        }
        if line.rate_minor < 0 {
            return Err(AppError::Validation(format!(
                "Line {} rate cannot be negative",
                index + 1
            )));
        }
        let line_discount = line.discount_minor.unwrap_or(0);
        if line_discount < 0 {
            return Err(AppError::Validation(format!(
                "Line {} discount cannot be negative",
                index + 1
            )));
        }

        let gross = line
            .rate_minor
            .checked_mul(line.quantity_milli)
            .map(|value| round_div_half_up(value, 1_000))
            .ok_or_else(|| {
                AppError::Validation(format!("Line {} amount is too large", index + 1))
            })?;
        if line_discount > gross {
            return Err(AppError::Validation(format!(
                "Line {} discount cannot exceed the line amount",
                index + 1
            )));
        }

        let line_taxable = gross - line_discount;
        let tax_rate_bps = line.tax_rate_bps.unwrap_or(0);
        if !(0..=10_000).contains(&tax_rate_bps) {
            return Err(AppError::Validation(format!(
                "Line {} tax rate must be between 0 and 100%",
                index + 1
            )));
        }
        let line_tax = line_taxable
            .checked_mul(tax_rate_bps)
            .map(|value| round_div_half_up(value, 10_000))
            .ok_or_else(|| AppError::Validation(format!("Line {} tax is too large", index + 1)))?;
        let line_total = line_taxable + line_tax;

        subtotal_minor = subtotal_minor.saturating_add(gross);
        discount_minor = discount_minor.saturating_add(line_discount);
        taxable_minor = taxable_minor.saturating_add(line_taxable);
        tax_minor = tax_minor.saturating_add(line_tax);
        preview_lines.push(PurchaseLinePreview {
            index: index as i64,
            taxable_minor: line_taxable,
            tax_minor: line_tax,
            line_total_minor: line_total,
        });
    }

    Ok(PurchasePreview {
        subtotal_minor,
        discount_minor,
        taxable_minor,
        tax_minor,
        grand_total_minor: taxable_minor + tax_minor,
        lines: preview_lines,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(
        quantity_milli: i64,
        rate_minor: i64,
        discount_minor: i64,
        tax: i64,
    ) -> SalesInvoiceLineInput {
        SalesInvoiceLineInput {
            item_id: Some(1),
            description: Some("Cement".into()),
            hsn_code: Some("2523".into()),
            unit_id: Some(1),
            quantity_milli,
            rate_minor,
            discount_minor: Some(discount_minor),
            tax_rate_bps: Some(tax),
        }
    }

    #[test]
    fn computes_gst_intra_state_totals() {
        let preview = compute_invoice("GST", false, &[line(1_500, 10_000, 500, 1_800)]).unwrap();
        assert_eq!(preview.subtotal_minor, 15_000);
        assert_eq!(preview.discount_minor, 500);
        assert_eq!(preview.taxable_minor, 14_500);
        assert_eq!(preview.cgst_minor, 1_305);
        assert_eq!(preview.sgst_minor, 1_305);
        assert_eq!(preview.igst_minor, 0);
        assert_eq!(preview.grand_total_minor, 17_110);
        assert_eq!(preview.lines[0].line_total_minor, 17_110);
    }

    #[test]
    fn computes_gst_inter_state_with_igst() {
        let preview = compute_invoice("GST", true, &[line(1_000, 10_000, 0, 1_800)]).unwrap();
        assert_eq!(preview.cgst_minor, 0);
        assert_eq!(preview.sgst_minor, 0);
        assert_eq!(preview.igst_minor, 1_800);
        assert_eq!(preview.grand_total_minor, 11_800);
    }

    #[test]
    fn non_gst_invoice_rejects_tax() {
        assert!(compute_invoice("NON_GST", false, &[line(1_000, 10_000, 0, 1_800)]).is_err());
    }

    #[test]
    fn rejects_non_positive_quantity() {
        assert!(compute_invoice("GST", false, &[line(0, 10_000, 0, 1_800)]).is_err());
        assert!(compute_invoice("GST", false, &[line(-1, 10_000, 0, 1_800)]).is_err());
    }

    #[test]
    fn rejects_discount_above_line_amount() {
        assert!(compute_invoice("GST", false, &[line(1_000, 10_000, 10_001, 1_800)]).is_err());
    }

    #[test]
    fn aggregates_multiple_lines() {
        let preview = compute_invoice(
            "GST",
            false,
            &[line(1_000, 10_000, 0, 1_800), line(500, 20_000, 0, 500)],
        )
        .unwrap();
        assert_eq!(preview.subtotal_minor, 20_000);
        assert_eq!(preview.taxable_minor, 20_000);
        assert_eq!(preview.cgst_minor, 1_150);
        assert_eq!(preview.sgst_minor, 1_150);
        assert_eq!(preview.grand_total_minor, 22_300);
    }

    #[test]
    fn fiscal_year_uses_configured_start_month() {
        let april = NaiveDate::from_ymd_opt(2026, 4, 1).unwrap();
        let march = NaiveDate::from_ymd_opt(2026, 3, 31).unwrap();
        assert_eq!(fiscal_year_for(april, 4), "2026-27");
        assert_eq!(fiscal_year_for(march, 4), "2025-26");
    }

    #[test]
    fn invoice_numbers_are_zero_padded() {
        assert_eq!(
            format_invoice_number("GST", "2026-27", 42),
            "GST/2026-27/00042"
        );
    }
}
