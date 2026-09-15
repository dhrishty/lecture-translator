# Remote translation backend

The Vercel frontend cannot connect to a Mac's `127.0.0.1:5000`. Deploy this container on a host that supports persistent Python services, then set `LIBRETRANSLATE_URL` in the Vercel project's production environment to its HTTPS address and redeploy.

From this directory:

```sh
docker build -t lecture-libretranslate .
docker run --rm -p 5000:8080 lecture-libretranslate
```

It packages only the Korean-to-English model, serves on port 8080, and disables file translation and the separate web UI. Check `/languages` and translate a sample before connecting Vercel. No transcript persistence or translation cache is enabled. Hosting costs and access controls depend on the chosen host.

This container definition is prepared, but has not been built or hosted yet. Local LibreTranslate has been independently installed and verified on the development Mac.

## Prepared Render Blueprint

The repository-root `render.yaml` selects Render's **free** web-service plan explicitly. Import it as a Blueprint after connecting a Render account to this private GitHub repository. No Render service has been created yet, and no paid plan has been activated.

The free instance has limited CPU/RAM and sleeps when idle. It is a trial deployment target, not a guarantee of live-lecture latency. After deployment, test a Korean paragraph and measure response time before using it in class. If it cannot run within the resource limits, review paid pricing before changing plans.

After Render reports the service healthy:

1. Verify `/languages` includes `ko` with `en` in `targets`.
2. POST a sample to `/translate` with `q`, `source: ko`, `target: en`, and `format: text`.
3. Add the service's HTTPS origin as `LIBRETRANSLATE_URL` in Vercel production environment variables.
4. Redeploy Vercel and verify its `/api/translate` route.

Cold starts can exceed the app's timeout. Warm the service before a lecture and retry failed segments. No automatic keep-alive pings or paid upgrades are configured.
