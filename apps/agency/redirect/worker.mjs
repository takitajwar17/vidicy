const APP_ORIGIN = "https://vidicy-agency-vw6akohvja-as.a.run.app";

export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    const destination = new URL(APP_ORIGIN);
    destination.pathname = incoming.pathname;
    destination.search = incoming.search;
    return new Response(null, {
      status: 308,
      headers: {
        Location: destination.href,
        // Permit a safe rollback without a cached redirect in the browser.
        "Cache-Control": "no-store",
      },
    });
  },
};
