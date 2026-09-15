# Remote translation backend

The Vercel frontend cannot connect to a Mac's `127.0.0.1:5000`. Deploy this container on a host that supports persistent Python services, then set `LIBRETRANSLATE_URL` in the Vercel project's production environment to its HTTPS address and redeploy.

From this directory:

```sh
docker build -t lecture-libretranslate .
docker run --rm -p 5000:8080 lecture-libretranslate
```

It packages only the Korean-to-English model, serves on port 8080, and disables file translation and the separate web UI. Check `/languages` and translate a sample before connecting Vercel. No transcript persistence or translation cache is enabled. Hosting costs and access controls depend on the chosen host.

This container definition is prepared, but has not been built or hosted yet. Local LibreTranslate has been independently installed and verified on the development Mac.
