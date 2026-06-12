# SR Follow-ups Playbook

This is the original Follow-Up Playbook interface adapted to read the Google Sheet tab:

`Master Table - SR Follow ups`

It displays only these flows:

- Before SR
- Follow up
- Future

## Files

Upload these files to the GitHub repository root:

- `index.html`
- `styles.css`
- `script.js`
- `config.js`
- `data.json`
- `.nojekyll`
- `README.md`

## Google Sheet requirements

The Google Sheet must be visible to anyone with the link as Viewer.
The tab name in `config.js` must match exactly:

`Master Table - SR Follow ups`

The script reads the range `A:AZ` and searches for the row containing the flow-table headers.
