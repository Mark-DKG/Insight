#!/usr/bin/env python3
"""Builds public/geo/*.json for the country → region → city dropdowns.

Sources (public datasets):
  datasets/world-cities  (GeoNames cities with population > 15,000): city, country, region
  dr5hn/countries-states-cities-database states.json: full list of first-level regions per country
Usage: build-geo.py world-cities.csv states.json
Ghana is topped up by hand so every one of its 16 regions has its main towns.
"""
import csv, json, re, sys, os, unicodedata
from collections import defaultdict

wc, st = sys.argv[1], sys.argv[2]
out = os.path.join(os.path.dirname(__file__), "..", "public", "geo")
os.makedirs(out, exist_ok=True)

ALIAS = {  # dr5hn name -> world-cities name
    "Russia": "Russia", "Korea, South": "South Korea", "Korea, North": "North Korea",
    "Czech Republic": "Czechia", "Ivory Coast": "Côte d'Ivoire", "Cote D'Ivoire (Ivory Coast)": "Côte d'Ivoire",
}
CANON = {  # variant spellings -> one canonical name (applied to both sources)
    "Bolivia, Plurinational State of": "Bolivia", "Brunei Darussalam": "Brunei", "Cabo Verde": "Cape Verde",
    "Congo, The Democratic Republic of the": "Democratic Republic of the Congo",
    "Fiji Islands": "Fiji", "Hong Kong S.A.R.": "Hong Kong", "Iran, Islamic Republic of": "Iran",
    "Korea, Democratic People's Republic of": "North Korea", "Korea, Republic of": "South Korea",
    "Lao People's Democratic Republic": "Laos", "Man (Isle of)": "Isle of Man",
    "Micronesia, Federated States of": "Micronesia", "Moldova, Republic of": "Moldova",
    "Palestine, State of": "Palestine", "Russian Federation": "Russia", "Réunion": "Reunion",
    "Saint-Barthelemy": "Saint Barthélemy", "Saint-Martin (French part)": "Saint Martin (French part)",
    "Syrian Arab Republic": "Syria", "Taiwan, Province of China": "Taiwan", "Tanzania, United Republic of": "Tanzania",
    "The Bahamas": "Bahamas", "The Gambia": "Gambia", "Türkiye": "Turkey", "Venezuela, Bolivarian Republic of": "Venezuela",
    "Viet Nam": "Vietnam", "Virgin Islands (US)": "United States Virgin Islands", "Virgin Islands, U.S.": "United States Virgin Islands", "Wallis and Futuna Islands": "Wallis and Futuna",
    "Åland Islands": "Aland Islands", "Saint Helena, Ascension and Tristan da Cunha": "Saint Helena",
    "Virgin Islands, British": "British Virgin Islands",
    "Côte d'Ivoire": "Ivory Coast", "Czechia": "Czech Republic", "Holy See (Vatican City State)": "Vatican City",
    "Congo": "Republic of the Congo",
}
def canon(n): return CANON.get(n, n)
def slug(s): return re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()).strip("-")

countries = defaultdict(lambda: defaultdict(set))  # country -> region -> cities
for row in csv.DictReader(open(wc, encoding="utf-8")):
    if row["name"] and row["country"]:
        countries[canon(row["country"])][row["subcountry"] or ""].add(row["name"])

for s in json.load(open(st, encoding="utf-8")):
    if s.get("parent_id"):  # first-level regions only
        continue
    c = canon(ALIAS.get(s["country_name"], s["country_name"]))
    countries[c].setdefault(s["name"], set())

GHANA = {
    "Greater Accra": ["Accra", "Tema", "Madina", "Ashaiman", "Teshie", "Nungua", "Dome", "Kasoa-Weija", "Amasaman", "Dodowa"],
    "Ashanti": ["Kumasi", "Obuasi", "Ejisu", "Mampong", "Konongo", "Bekwai", "Offinso", "Tepa"],
    "Western": ["Sekondi-Takoradi", "Tarkwa", "Prestea", "Axim", "Half Assini"],
    "Western North": ["Sefwi Wiawso", "Bibiani", "Enchi", "Juaboso"],
    "Central": ["Cape Coast", "Winneba", "Kasoa", "Swedru", "Mankessim", "Elmina", "Assin Fosu"],
    "Eastern": ["Koforidua", "Nsawam", "Suhum", "Akim Oda", "Nkawkaw", "Akuapem Mampong", "Somanya"],
    "Volta": ["Ho", "Hohoe", "Keta", "Aflao", "Sogakope", "Kpando"],
    "Oti": ["Dambai", "Nkwanta", "Kadjebi", "Jasikan"],
    "Northern": ["Tamale", "Yendi", "Savelugu", "Bimbilla"],
    "Savannah": ["Damongo", "Bole", "Salaga", "Buipe"],
    "North East": ["Nalerigu", "Walewale", "Gambaga", "Bunkpurugu"],
    "Upper East": ["Bolgatanga", "Bawku", "Navrongo", "Zebilla"],
    "Upper West": ["Wa", "Tumu", "Lawra", "Jirapa"],
    "Bono": ["Sunyani", "Berekum", "Dormaa Ahenkro", "Wenchi"],
    "Bono East": ["Techiman", "Kintampo", "Atebubu", "Nkoranza"],
    "Ahafo": ["Goaso", "Bechem", "Kenyasi", "Hwidiem"],
}
for region, cities in GHANA.items():
    countries["Ghana"][region].update(cities)
for stray in [r for r in countries["Ghana"] if r not in GHANA]:
    if not countries["Ghana"][stray]:  # drop empty stray regions
        del countries["Ghana"][stray]

index = []
for name in sorted(countries):
    regions = []
    for rname in sorted(countries[name], key=lambda x: (x == "", x)):
        cities = sorted(countries[name][rname], key=lambda x: unicodedata.normalize("NFKD", x).lower())
        if rname == "" and not cities: continue
        regions.append({"n": rname or "Other", "c": cities})
    if not regions: continue
    f = slug(name)
    json.dump({"country": name, "regions": regions}, open(os.path.join(out, f + ".json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    index.append({"n": name, "f": f})
json.dump(index, open(os.path.join(out, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(index), "countries")
