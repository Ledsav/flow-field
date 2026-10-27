# Flow-Field Noise Explorer

## Description
`flow-field` is a tool designed for manipulating flow fields using various noise patterns.

## Features
- Apply different noise types to influence flow fields.
- Switch between static and dynamic noise modes.
- Adjust noise parameters interactively and in real-time.

## Target Audience
This tool is ideal for developers and artists seeking a direct, hands-on experience with noise-influenced flow fields.

## Running it
Live: https://www.albertovaldesrey.com/flow-field/

Plain HTML, CSS and JavaScript: no build step and no dependencies. `index.js` is loaded as an ES module, so the
page must be served over HTTP (opening `index.html` from disk fails). Any static server works, e.g. Python 3:

```bash
git clone https://github.com/Ledsav/flow-field.git
cd flow-field
python -m http.server 8000     # or: npx serve .
# then open http://localhost:8000/
```

In VS Code, **Terminal → Run Task… → Setup (fresh clone)** only checks that Python is available (there is
nothing to install), and **Dev** starts the server above.
