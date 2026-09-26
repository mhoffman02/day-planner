# Debug Logging: Console Only, No Temporary UI Elements

- When instrumenting code for temporary debugging, error diagnosis, or data inspection: **USE the browser console (`console.log`, `console.warn`, `console.error`, `console.info`)**.
- **DO NOT** inject temporary diagnostic text, error hint spans/paragraphs, banner messages, or ad-hoc UI elements into the application interface.
- Keep the user interface clean and distraction-free. The developer inspects the browser DevTools Console during debugging sessions.
