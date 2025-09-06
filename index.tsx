// This file is a shim to redirect to the correct entry point.
// It resolves a server misconfiguration that attempts to load this file
// instead of the correct index.html, leading to a MIME type error.
// By importing the main script, we ensure the application loads correctly.
import './js/core/index.js';
