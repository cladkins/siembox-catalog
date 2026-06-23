# siembox-parsers

Community catalog of portable **parsers** (and, soon, detections) for
[SIEMBox](https://github.com/cladkins/SIEMBOX). Each parser is a self-contained
`*.parser.json` file: a match pattern, field mappings to SIEMBox's canonical
schema, declarative `derivations`, and `test_samples` that assert the canonical
fields it must produce.

The promise: **a parser that passes CI here installs into SIEMBox and behaves
identically**, because CI runs the exact same parse -> derive -> normalize pipeline
the app uses.

## Install in-app

In SIEMBox: **Parsers -> Browse Catalog**. SIEMBox lists this repo's tree, pulls
each `parsers/*.parser.json` from `raw.githubusercontent`, **validates + runs its
self-tests**, then upserts — flagging each as installed / update-available. Point
SIEMBox here with:

```
PARSER_CATALOG_REPO=cladkins/siembox-parsers
PARSER_CATALOG_REF=main
PARSER_CATALOG_PATH=parsers
```

(These are the defaults in current SIEMBox builds.)

## Layout

```
parsers/     *.parser.json   — one portable parser per file
detections/  *.yaml          — detection rules (by category), the SIEMBox rule format
schema/      parser.schema.json — JSON Schema (editor autocomplete + docs)
```

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md). In short: add
`parsers/<name>.parser.json` with canonical field mappings and at least one
`test_sample`, open a PR, and make the **Validate parsers** check green.

## License

MIT — see [LICENSE](./LICENSE).
