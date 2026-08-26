"""Generates synthetic .xls fixtures for the SF1 bulk import engine's tests.

SYNTHETIC TEST DATA ONLY -- contains no real learner information. All
names use the project's established fictional-data convention (fictional
given/family names paired with an obvious marker word: TEST, SAMPLE,
DEMO, MOCK, SPECIMEN, PLACEHOLDER, SYNTHETIC). No real LRNs, addresses,
or parent names appear anywhere in this file or its output.

The column layout below (LRN, Family Name, Given Name, Sex, Birthdate,
Remarks, starting at row 3) is this project's OWN invented structure --
no official DepEd SF1 .xls template was available to verify cell
coordinates against (see docs/adr/0043-sf1-bulk-import-engine.md's
"Fidelity Disclosure" section). Re-run this script only if the fixture
scenarios themselves need to change; do not hand-edit the generated
.xls files.
"""

import xlwt

def build_main_fixture():
    wb = xlwt.Workbook()
    sheet = wb.add_sheet("SF1")

    date_style = xlwt.easyxf(num_format_str="YYYY-MM-DD")

    sheet.write(0, 0, "SCHOOL FORM 1 (SF1) SCHOOL REGISTER -- SYNTHETIC TEST FIXTURE, NOT AN OFFICIAL DEPED TEMPLATE")
    sheet.write(1, 0, "School: TEST ELEMENTARY SCHOOL (SYNTHETIC, NOT A REAL SCHOOL)")
    sheet.write(2, 0, "LRN")
    sheet.write(2, 1, "Family Name")
    sheet.write(2, 2, "Given Name")
    sheet.write(2, 3, "Sex")
    sheet.write(2, 4, "Birthdate")
    sheet.write(2, 5, "Remarks")

    rows = [
        # row_number (1-based, header at row 3) -> data
        ("123456789012", "DELA CRUZ", "ANA TEST", "F", "2015-06-15", ""),
        ("", "SANTOS", "BEN SAMPLE", "M", "2015-01-10", ""),
        ("223456789012", "REYES", "CARLA DEMO", "Male", "2015-03-22", ""),
        ("3234567890", "CRUZ", "DANNY MOCK", "M", "2015-04-01", ""),  # invalid LRN (10 digits)
        ("", "", "ELLA PLACEHOLDER", "F", "2015-05-05", ""),  # missing family name
        ("", "GARCIA", "FELIX SPECIMEN", "X", "2015-02-02", ""),  # unrecognized sex
        ("", "TORRES", "GRACE SYNTHETIC", "F", "2015-07-07", ""),  # suspected duplicate (matched in test setup)
        ("523456789012", "MENDOZA", "HERO EXAMPLE", "F", "not a date", ""),  # unparseable birthdate
    ]
    for i, (lrn, family, given, sex, birthdate, remarks) in enumerate(rows):
        r = 3 + i
        sheet.write(r, 0, lrn)
        sheet.write(r, 1, family)
        sheet.write(r, 2, given)
        sheet.write(r, 3, sex)
        if birthdate == "not a date":
            sheet.write(r, 4, birthdate)
        elif birthdate:
            import datetime
            y, m, d = (int(x) for x in birthdate.split("-"))
            sheet.write(r, 4, datetime.date(y, m, d), date_style)
        sheet.write(r, 5, remarks)

    wb.save("sf1_synthetic_main.xls")


def build_formula_fixture():
    wb = xlwt.Workbook()
    sheet = wb.add_sheet("SF1")
    sheet.write(0, 0, "SCHOOL FORM 1 (SF1) -- SYNTHETIC FORMULA-CELL PROBE FIXTURE")
    sheet.write(1, 0, "LRN")
    sheet.write(1, 1, "Family Name")
    sheet.write(1, 2, "Given Name")
    sheet.write(1, 3, "Sex")
    sheet.write(1, 4, "Birthdate")
    sheet.write(1, 5, "Remarks")
    sheet.write(2, 0, xlwt.Formula('"623456789012"'))
    sheet.write(2, 1, "IBARRA")
    sheet.write(2, 2, "IVY FORMULA")
    sheet.write(2, 3, "F")
    sheet.write(2, 5, "")
    wb.save("sf1_synthetic_formula.xls")


def build_oversized_row_count_fixture():
    wb = xlwt.Workbook()
    sheet = wb.add_sheet("SF1")
    sheet.write(0, 0, "SCHOOL FORM 1 (SF1) -- SYNTHETIC OVERSIZED FIXTURE")
    sheet.write(1, 0, "LRN")
    sheet.write(1, 1, "Family Name")
    sheet.write(1, 2, "Given Name")
    sheet.write(1, 3, "Sex")
    sheet.write(1, 4, "Birthdate")
    sheet.write(1, 5, "Remarks")
    for i in range(3100):
        r = 2 + i
        sheet.write(r, 0, "")
        sheet.write(r, 1, "BULK")
        sheet.write(r, 2, f"ROW{i} SYNTHETIC")
        sheet.write(r, 3, "M")
    wb.save("sf1_synthetic_oversized.xls")


def build_no_header_fixture():
    wb = xlwt.Workbook()
    sheet = wb.add_sheet("SF1")
    sheet.write(0, 0, "This workbook has no recognizable SF1 header row at all.")
    wb.save("sf1_synthetic_no_header.xls")


if __name__ == "__main__":
    build_main_fixture()
    build_formula_fixture()
    build_oversized_row_count_fixture()
    build_no_header_fixture()
    print("Generated synthetic SF1 .xls fixtures.")
