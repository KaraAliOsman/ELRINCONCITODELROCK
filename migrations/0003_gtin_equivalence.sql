-- Readers may emit a UPC-A as EAN-13 or GTIN-14 with leading zeroes.
-- They represent the same item, so they must never identify different discs.
CREATE UNIQUE INDEX product_barcodes_gtin
 ON product_barcodes(substr('00000000000000' || code,-14))
 WHERE kind='retail';
