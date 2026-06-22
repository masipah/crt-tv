# Serving the installer from masipah.com (Vercel)

The code lives on GitHub (`github.com/masipah/crt-tv`). masipah.com just needs to
make the one-liner `curl -sSL https://masipah.com/crt-tv/install.sh | bash` work
by proxying that path to the bootstrap script on GitHub — no files to copy, no
tarball to maintain, always the latest `deploy/bootstrap.sh`.

## Add the rewrite to your existing masipah.com project

In your masipah.com Vercel project's `vercel.json`, add the rewrite from
[`vercel.json`](vercel.json) here:

```json
{
  "rewrites": [
    {
      "source": "/crt-tv/install.sh",
      "destination": "https://raw.githubusercontent.com/masipah/crt-tv/main/deploy/bootstrap.sh"
    }
  ]
}
```

Merge it into any existing `rewrites` array. Redeploy, then test:

```bash
curl -sSL https://masipah.com/crt-tv/install.sh        # prints the script
curl -sSL https://masipah.com/crt-tv/install.sh | bash # installs on the Pi
```

A Vercel rewrite proxies the response (the URL stays `masipah.com`), so `curl`
sees the script directly.

## Notes

- The bootstrap then `git clone`s `https://github.com/masipah/crt-tv.git`. If you
  use a different repo/owner, update both the `destination` above and the
  defaults in `deploy/bootstrap.sh` (`CRT_TV_REPO`), or pass `CRT_TV_REPO=…`.
- Private repo? Either make it public, or have the bootstrap fetch a tarball
  instead (`CRT_TV_TARBALL=…`) from a URL that carries its own auth.
