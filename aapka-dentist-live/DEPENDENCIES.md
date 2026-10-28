# Dependency and service inventory

- Runtime: Node.js built-in `http`, `fs`, `crypto`, `path`, `url`, and `readline` modules.
- Client: original HTML, CSS, and JavaScript; browser Fetch, dialogs, and speech features.
- Appointment storage: one local JSON file shared by patient and staff routes; demo-only, no separate dashboard store.
- Authentication: Node.js `scrypt` password hashes, random server-side sessions, HttpOnly cookies, and in-memory login throttling.
- External APIs, SDKs, npm dependencies, hosted databases, AI APIs, email APIs: none.
- Remote visual assets: none.
