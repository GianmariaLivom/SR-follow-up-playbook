/*
  SR Follow-ups Playbook configuration.
  This version keeps the original playbook interface and reads the
  "Master Table - SR Follow ups" tab from the same Google Sheet.
*/
window.PLAYBOOK_SPREADSHEET_ID = "1aayW-28FgZ315-ATeexxmGnvodsru_G2p6WUufuOng4";
window.PLAYBOOK_SHEET_NAME = "Master Table - SR Follow ups";
window.PLAYBOOK_RANGE = "A:AZ";
window.PLAYBOOK_ALLOWED_FLOWS = ["Before SR", "Follow up", "Future"];
window.PLAYBOOK_SHEET_URL = "https://docs.google.com/spreadsheets/d/1aayW-28FgZ315-ATeexxmGnvodsru_G2p6WUufuOng4/edit";

/*
  Optional fallback. Leave empty when using the Google Sheet above.
*/
window.PLAYBOOK_CSV_URL = "";
