#!/usr/bin/env python3
import sys
from datetime import datetime

def main():
    if len(sys.argv) != 4:
        print("Usage: endless_summer.py YEAR MONTH DAY")
        sys.exit(1)

    year_str, month_str, day_str = sys.argv[1], sys.argv[2], sys.argv[3]
    year = int(year_str)
    month = int(month_str)
    day = int(day_str)

    date = datetime(year, month, day)

    if month >= 8:
        start_year = year
    else:
        start_year = year - 1
    start_date = datetime(start_year, 8, 1)

    delta_days = (date - start_date).days + 1

    print(f"8 {delta_days}")

if __name__ == "__main__":
    main()