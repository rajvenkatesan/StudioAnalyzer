# StudioHelper

Per-studio scraping hints. Each section (`## BrandName`) tells the scraper
where to find schedule and pricing data for that studio brand.

The brand name is matched case-insensitively against the normalized brand name
stored in the database (letters and digits only, spaces/punctuation removed).

---

## Supported keys

| Key             | Description |
|-----------------|-------------|
| `locations_page` | Full URL of a page that lists all studio locations. The scraper will spider this page, follow the individual location links it finds, and extract schedule + pricing from each location page. |
| `schedule_page`  | Path (e.g. `/classes`) or full URL where the class schedule is published. Relative paths are resolved against the studio's website URL. |
| `pricing_page`   | Path (e.g. `/pricing`) or full URL where pricing / membership plans are published. |

> **Note:** If `locations_page` is set, the scraper spiders that page for
> location sub-links and scrapes each one individually. `schedule_page` and
> `pricing_page` are then treated as per-location hints (appended to each
> location URL if they are relative paths).

---

## Examples

## jetsetpilates
locations_page: https://jetsetpilates.com/locations
schedule_page: schedule/
pricing_page: pricing/

## solidcore
schedule_page: /classes
pricing_page: /pricing

## orangetheory
locations_page: https://www.orangetheory.com/en-us/locations/
