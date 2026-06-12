# SR Follow-ups Playbook

Static GitHub Pages playbook connected to this Google Sheet tab:

- Spreadsheet ID: `1aayW-28FgZ315-ATeexxmGnvodsru_G2p6WUufuOng4`
- Sheet tab: `Master Table - SR Follow ups`

## Files

- `index.html` — page structure
- `styles.css` — visual format
- `app.js` — live Google Sheet loader, filters, search, copy button
- `config.js` — spreadsheet connection settings
- `.nojekyll` — tells GitHub Pages to serve files directly

## Google Sheet requirement

Publish the Google Sheet/tab to the web. The site reads published data; it does not edit the sheet.

Recommended:

1. Open the Google Sheet.
2. Click `File` > `Share` > `Publish to web`.
3. Select the sheet tab `Master Table - SR Follow ups` or publish the entire spreadsheet.
4. Keep automatic republishing enabled.
5. Click `Publish`.

Google can take a few minutes to show updates after Sheet changes.

## GitHub upload

To keep the existing playbook untouched, create a new repository, for example:

`sr-follow-up-playbook`

Upload these files to the root of the repository, then enable GitHub Pages from the repository settings.

Expected URL format:

`https://gianmarialivom.github.io/sr-follow-up-playbook/`

If you upload these files into the existing `follow-up-playbook` repository, the current playbook will be replaced.

## Change the connected tab later

Edit only `config.js`:

```js
window.PLAYBOOK_CONFIG = {
  spreadsheetId: "1aayW-28FgZ315-ATeexxmGnvodsru_G2p6WUufuOng4",
  sheetName: "Master Table - SR Follow ups"
};
```

The `sheetName` must match the Google Sheet tab name exactly.
