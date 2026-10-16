//! Synthetic ZIP-9 compatibility cases for the actual spreadsheet libraries.
use std::io::{Cursor, Read, Write};

use calamine::{Reader, Xlsx};
use zip::write::SimpleFileOptions;

fn workbook_bytes() -> Vec<u8> {
    let mut book = umya_spreadsheet::new_file();
    let sheet = book.sheet_mut(0).unwrap();
    sheet.cell_mut("A1").set_value("Synthetic learner");
    sheet.cell_mut("B1").set_value_number(88);
    let mut bytes = Vec::new();
    umya_spreadsheet::writer::xlsx::write_writer(&book, &mut bytes).unwrap();
    bytes
}

#[test]
fn spreadsheet_zip9_reads_written_values_with_both_libraries() {
    let bytes = workbook_bytes();
    let mut reader: Xlsx<_> = Xlsx::new(Cursor::new(&bytes)).unwrap();
    let range = reader.worksheet_range_at(0).unwrap().unwrap();
    assert_eq!(range.get((0, 0)).unwrap().to_string(), "Synthetic learner");
    assert_eq!(range.get((0, 1)).unwrap().to_string(), "88");
    let book = umya_spreadsheet::reader::xlsx::read_reader(Cursor::new(bytes), true).unwrap();
    assert_eq!(book.sheet(0).unwrap().value("A1"), "Synthetic learner");
    assert_eq!(book.sheet(0).unwrap().value("B1"), "88");
}

#[test]
fn spreadsheet_zip9_preserves_case_and_backslash_lookup_tolerance() {
    let mut source = zip::ZipArchive::new(Cursor::new(workbook_bytes())).unwrap();
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for index in 0..source.len() {
        let mut entry = source.by_index(index).unwrap();
        let name = entry
            .name()
            .unwrap()
            .replace('/', "\\")
            .to_ascii_uppercase();
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).unwrap();
        writer
            .start_file(name, SimpleFileOptions::default())
            .unwrap();
        writer.write_all(&bytes).unwrap();
    }
    let bytes = writer.finish().unwrap().into_inner();
    let mut reader: Xlsx<_> = Xlsx::new(Cursor::new(&bytes)).unwrap();
    let range = reader.worksheet_range_at(0).unwrap().unwrap();
    assert_eq!(range.get((0, 1)).unwrap().to_string(), "88");
    let book = umya_spreadsheet::reader::xlsx::read_reader(Cursor::new(bytes), true).unwrap();
    assert_eq!(book.sheet(0).unwrap().value("A1"), "Synthetic learner");
}

#[test]
fn spreadsheet_zip9_preserves_legacy_cp437_entry_names() {
    let mut source = zip::ZipArchive::new(Cursor::new(workbook_bytes())).unwrap();
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for index in 0..source.len() {
        let mut entry = source.by_index(index).unwrap();
        let name = entry.name().unwrap().into_owned();
        let mut data = Vec::new();
        entry.read_to_end(&mut data).unwrap();
        writer
            .start_file(name, SimpleFileOptions::default())
            .unwrap();
        writer.write_all(&data).unwrap();
    }
    writer
        .start_file("legacy.txt", SimpleFileOptions::default())
        .unwrap();
    writer.write_all(b"Synthetic legacy entry").unwrap();
    let mut bytes = writer.finish().unwrap().into_inner();
    // A non-UTF-8 byte is legitimate CP437 when the UTF-8 flag is clear.
    let mut changed = 0;
    for offset in 0..bytes.len().saturating_sub(46) {
        let (name_offset, flag_offset) = match &bytes[offset..offset + 4] {
            b"PK\x03\x04" => (offset + 30, offset + 6),
            b"PK\x01\x02" => (offset + 46, offset + 8),
            _ => continue,
        };
        if bytes.get(name_offset..name_offset + 10) == Some(b"legacy.txt") {
            bytes[name_offset] = 0xff;
            bytes[flag_offset + 1] &= !0x08;
            changed += 1;
        }
    }
    assert_eq!(changed, 2);
    let archive = zip::ZipArchive::new(Cursor::new(&bytes)).unwrap();
    assert!(archive
        .file_names()
        .any(|name| name.unwrap() == "\u{a0}egacy.txt"));
    let mut reader: Xlsx<_> = Xlsx::new(Cursor::new(&bytes)).unwrap();
    assert_eq!(
        reader
            .worksheet_range_at(0)
            .unwrap()
            .unwrap()
            .get((0, 1))
            .unwrap()
            .to_string(),
        "88"
    );
    let book = umya_spreadsheet::reader::xlsx::read_reader(Cursor::new(bytes), true).unwrap();
    assert_eq!(book.sheet(0).unwrap().value("B1"), "88");
}

#[test]
fn spreadsheet_zip9_rejects_truncated_archives_without_panicking() {
    let mut bytes = workbook_bytes();
    bytes.truncate(16);
    let calamine = std::panic::catch_unwind(|| Xlsx::new(Cursor::new(bytes.clone())));
    assert!(matches!(calamine, Ok(Err(_))));
    let umya = std::panic::catch_unwind(|| {
        umya_spreadsheet::reader::xlsx::read_reader(Cursor::new(bytes), true)
    });
    assert!(matches!(umya, Ok(Err(_))));
}
