import argparse
import binascii
from csv import DictReader

from cardutil.cli import get_config
from cardutil.mciipm import IpmWriter


def build_de43(row):
    name = (row.get("DE43_NAME") or "").strip()
    if not name:
        return None
    address = (row.get("DE43_ADDRESS") or "TEST ADDRESS").strip()
    suburb = (row.get("DE43_SUBURB") or "").strip()
    postcode = (row.get("DE43_POSTCODE") or "").strip()[:10].ljust(10)
    state = (row.get("DE43_STATE") or "").strip()[:3].ljust(3)
    country = (row.get("DE43_COUNTRY") or "NZL").strip()[:3]
    return f"{name}\\{address}\\{suburb}\\{postcode}{state}{country}"


def split_pds(de48):
    out, i = {}, 0
    while i + 7 <= len(de48):
        tag, ln = de48[i:i + 4], int(de48[i + 4:i + 7])
        out["PDS" + tag] = de48[i + 7:i + 7 + ln]
        i += 7 + ln
    return out


def convert(row):
    rec = {k: v for k, v in row.items() if v}

    de43 = build_de43(row)
    if de43:
        rec["DE43"] = de43

    icc = (row.get("ICC_DATA") or "").strip()
    if icc:
        rec["DE55"] = binascii.unhexlify(icc)

    de48 = row.get("DE48") or ""
    if de48.strip():
        for k, v in split_pds(de48).items():
            rec.setdefault(k, v)
    rec.pop("DE48", None)
    return rec


def main():
    p = argparse.ArgumentParser()
    p.add_argument("in_filename")
    p.add_argument("-o", "--out-filename")
    p.add_argument("--in-encoding")
    p.add_argument("--out-encoding")
    p.add_argument("--no1014blocking", action="store_true")
    p.add_argument("--config-file")
    a = p.parse_args()

    config = get_config("cardutil.json", cli_filename=a.config_file)
    out = a.out_filename or a.in_filename + ".ipm"
    with open(a.in_filename, "r", encoding=a.in_encoding, newline="") as fin, open(out, "wb") as fout:
        with IpmWriter(fout, encoding=a.out_encoding, blocked=not a.no1014blocking,
                       iso_config=config.get("bit_config")) as w:
            for row in DictReader(fin):
                w.write(convert(row))


if __name__ == "__main__":
    main()