FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    ARGOS_PACKAGES_DIR=/models \
    XDG_DATA_HOME=/tmp/translation-data \
    XDG_CONFIG_HOME=/tmp/translation-config \
    XDG_CACHE_HOME=/tmp/translation-cache
RUN pip install libretranslate==1.9.6
# Include the Korean -> English model in the image; never store lecture content.
RUN python -c "import argostranslate.package as p; p.update_package_index(); package = next(x for x in p.get_available_packages() if x.from_code == 'ko' and x.to_code == 'en'); p.install_from_path(package.download())"
EXPOSE 8080
CMD ["libretranslate", "--host", "0.0.0.0", "--port", "8080", "--load-only", "ko,en", "--disable-web-ui", "--disable-files-translation"]
