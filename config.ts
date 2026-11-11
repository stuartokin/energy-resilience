// Site settings you may want to change.

// Address of your Cloudflare Worker that collects live power cuts from NGED, SSEN,
// SP Energy Networks and Electricity North West (see worker/outages-worker.js and the README).
// Leave empty ('') until the Worker is set up - the site works without it.
export const OUTAGE_WORKER_URL: string = '';
